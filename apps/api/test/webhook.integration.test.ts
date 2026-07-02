import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { buildSignatureManifest, computeSignature } from '@pix-live/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { WebhookService } from '../src/webhook/webhook.service.js';
import type { WebhookInput } from '../src/webhook/webhook.service.js';
import type {
  PaymentProvider,
  PixCharge,
  RemotePayment,
} from '../src/payment/payment-provider.port.js';

/**
 * Integração contra Postgres REAL — prova a joia da coroa ("dinheiro não duplica
 * sob corrida"). Pula quando não há DATABASE_URL (ex.: job unitário da CI sem
 * banco); roda no job de integração da CI (service container) e local (embedded).
 */
const HAS_DB =
  typeof process.env['DATABASE_URL'] === 'string' && process.env['DATABASE_URL'] !== '';
const SECRET = 'segredo-de-teste-abcdef123456';
const PAYMENT_ID = 'pay-integ-1';

/** Provider stub: getPayment sempre aprova, com valor/pedido controlados. */
function stubProvider(orderId: string, amountCents: number): PaymentProvider {
  return {
    createPixCharge: (): Promise<PixCharge> => {
      throw new Error('não usado no teste');
    },
    getPayment: (): Promise<RemotePayment | null> =>
      Promise.resolve({ status: 'approved', externalReference: orderId, amountCents }),
  };
}

/** Provider que falha as primeiras `failTimes` chamadas de getPayment e então aprova. */
function flakyProvider(orderId: string, amountCents: number, failTimes: number): PaymentProvider {
  let calls = 0;
  return {
    createPixCharge: (): Promise<PixCharge> => {
      throw new Error('não usado no teste');
    },
    getPayment: (): Promise<RemotePayment | null> => {
      calls += 1;
      if (calls <= failTimes) return Promise.reject(new Error('timeout de rede simulado'));
      return Promise.resolve({ status: 'approved', externalReference: orderId, amountCents });
    },
  };
}

/** Monta um input de webhook corretamente assinado (como o MP faria). */
function signedInput(dataId: string, requestId: string, tsSeconds: number): WebhookInput {
  const ts = String(tsSeconds);
  const v1 = computeSignature(buildSignatureManifest({ dataId, requestId, ts }), SECRET);
  return {
    rawBody: JSON.stringify({ type: 'payment', data: { id: dataId } }),
    dataId,
    signatureHeader: `ts=${ts},v1=${v1}`,
    requestId,
  };
}

describe.skipIf(!HAS_DB)('WebhookService (integração, Postgres real)', () => {
  let prisma: PrismaService;
  let service: WebhookService;
  let orderId: string;
  const nowSeconds = Math.floor(new Date('2026-07-02T12:00:00Z').getTime() / 1000);
  const fakeConfig = {
    get: (key: string): string | undefined => (key === 'MP_WEBHOOK_SECRET' ? SECRET : undefined),
  } as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Limpa na ordem das FKs (filhos antes dos pais).
    await prisma.orderCredit.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.outboundIdempotencyKey.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();

    const product = await prisma.product.create({
      data: { slug: 'kit', name: 'Kit Caderno Artesanal', description: 'demo', amountCents: 4700 },
    });
    const order = await prisma.order.create({
      data: {
        publicRef: 'ref-integ-1',
        productId: product.id,
        amountCents: 4700,
        status: 'pending',
        mpPaymentId: PAYMENT_ID,
      },
    });
    orderId = order.id;
    service = new WebhookService(prisma, fakeConfig, stubProvider(orderId, 4700));
  });

  it('caminho feliz: credita 1× e marca o pedido como pago', async () => {
    const out = await service.process(signedInput(PAYMENT_ID, 'req-1', nowSeconds));
    expect(out.verdict).toBe('processado');
    expect(out.status).toBe(200);
    expect(await prisma.orderCredit.count()).toBe(1);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('paid');
  });

  it('reentrega EXATA (mesmo request-id) → duplicata, crédito continua 1×', async () => {
    await service.process(signedInput(PAYMENT_ID, 'req-dup', nowSeconds));
    const second = await service.process(signedInput(PAYMENT_ID, 'req-dup', nowSeconds));
    expect(second.verdict).toBe('duplicata_ignorada');
    expect(await prisma.orderCredit.count()).toBe(1);
  });

  it('CORRIDA: 2 entregas concorrentes → 200/200, apenas 1 crédito (o banco resolve)', async () => {
    const [a, b] = await Promise.all([
      service.process(signedInput(PAYMENT_ID, 'req-race-a', nowSeconds)),
      service.process(signedInput(PAYMENT_ID, 'req-race-b', nowSeconds)),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // A prova: uma creditou, a outra pegou P2002 → duplicata. NUNCA 2 créditos.
    expect(await prisma.orderCredit.count()).toBe(1);
    const verdicts = [a.verdict, b.verdict].sort();
    expect(verdicts).toEqual(['duplicata_ignorada', 'processado']);
  });

  it('assinatura inválida → 401 e ZERO escrita no banco (short-circuit)', async () => {
    const bad: WebhookInput = {
      rawBody: '{"data":{"id":"pay-integ-1"}}',
      dataId: PAYMENT_ID,
      signatureHeader: 'ts=1,v1=deadbeef',
      requestId: 'req-bad',
    };
    await expect(service.process(bad)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.orderCredit.count()).toBe(0);
  });

  it('falha transitória de getPayment → 500; reentrega com MESMO request-id credita (finding 1)', async () => {
    const flaky = new WebhookService(prisma, fakeConfig, flakyProvider(orderId, 4700, 1));
    // 1ª entrega: getPayment falha → 500, e NADA é persistido (senão envenenaria o dedupe).
    await expect(
      flaky.process(signedInput(PAYMENT_ID, 'req-retry', nowSeconds)),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.orderCredit.count()).toBe(0);
    // Reentrega do MP com o MESMO request-id: agora getPayment sucede → DEVE creditar.
    const retry = await flaky.process(signedInput(PAYMENT_ID, 'req-retry', nowSeconds));
    expect(retry.verdict).toBe('processado');
    expect(await prisma.orderCredit.count()).toBe(1);
  });
});
