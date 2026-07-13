import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { WebhookSource } from '@prisma/client';
import { buildSignatureManifest, computeSignature } from '@pix-live/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OutboundBudgetService,
  REPLAY_LOOKUP_BUDGET,
} from '../src/payment/outbound-budget.service.js';
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

/**
 * Provider que EXPLODE se `getPayment` for invocado. Prova, por construção, que
 * o caminho não faz nenhuma chamada externa — com o provedor real, cada chamada
 * é uma requisição autenticada de saída (quota/custo/abuso).
 */
function explodingProvider(): PaymentProvider {
  return {
    createPixCharge: (): Promise<PixCharge> => {
      throw new Error('não usado no teste');
    },
    getPayment: (): Promise<RemotePayment | null> => {
      throw new Error('getPayment NÃO deveria ter sido chamado');
    },
  };
}

/** Provider que confirma o pagamento, mas com dados que NÃO batem com o pedido. */
function mismatchedProvider(overrides: Partial<RemotePayment>): PaymentProvider {
  return {
    createPixCharge: (): Promise<PixCharge> => {
      throw new Error('não usado no teste');
    },
    getPayment: (): Promise<RemotePayment | null> =>
      Promise.resolve({
        status: 'approved',
        externalReference: 'order-de-outro-fluxo',
        amountCents: 4700,
        ...overrides,
      }),
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
  // Relógio REAL, nunca data fixa: o service compara o ts com Date.now() de
  // verdade, então um "agora" hardcoded vira bomba-relógio — a suíte expira
  // sozinha quando a data fixa sai da janela anti-replay de 24h (aconteceu:
  // fixture de 2026-07-02 falhou em 2026-07-03 à noite, ts_suspeito em 3 testes).
  const nowSeconds = Math.floor(Date.now() / 1000);
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
    service = new WebhookService(
      prisma,
      fakeConfig,
      stubProvider(orderId, 4700),
      new OutboundBudgetService(),
    );
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

  it('VALOR divergente do provedor → NÃO credita (dados_divergentes)', async () => {
    // O provedor confirma "aprovado", mas de um pagamento de R$ 1,00 — e o pedido
    // é de R$ 47,00. Sem a conferência, creditaríamos os R$ 47,00 na palavra do
    // provedor sobre um id. É o buraco que a tese do projeto não pode ter.
    const divergente = new WebhookService(
      prisma,
      fakeConfig,
      mismatchedProvider({ externalReference: orderId, amountCents: 100 }),
      new OutboundBudgetService(),
    );

    const out = await divergente.process(signedInput(PAYMENT_ID, 'req-div-1', nowSeconds));

    expect(out.verdict).toBe('dados_divergentes');
    expect(out.status).toBe(200); // ack: divergência é permanente, reentrega não conserta
    expect(await prisma.orderCredit.count({ where: { mpPaymentId: PAYMENT_ID } })).toBe(0);
    const pedido = await prisma.order.findUnique({ where: { id: orderId } });
    expect(pedido?.status).toBe('pending'); // não virou pago
  });

  it('REFERÊNCIA externa de outro pedido → NÃO credita (dados_divergentes)', async () => {
    const divergente = new WebhookService(
      prisma,
      fakeConfig,
      mismatchedProvider({ externalReference: 'pedido-de-outra-loja', amountCents: 4700 }),
      new OutboundBudgetService(),
    );

    const out = await divergente.process(signedInput(PAYMENT_ID, 'req-div-2', nowSeconds));

    expect(out.verdict).toBe('dados_divergentes');
    expect(await prisma.orderCredit.count({ where: { mpPaymentId: PAYMENT_ID } })).toBe(0);
  });

  it('a divergência fica na trilha de auditoria (evento gravado, não engolido)', async () => {
    const divergente = new WebhookService(
      prisma,
      fakeConfig,
      mismatchedProvider({ externalReference: orderId, amountCents: 1 }),
      new OutboundBudgetService(),
    );
    await divergente.process(signedInput(PAYMENT_ID, 'req-div-3', nowSeconds));

    const evento = await prisma.webhookEvent.findFirst({
      where: { requestIdHeader: 'req-div-3' },
    });
    expect(evento?.verdict).toBe('dados_divergentes');
  });

  it('orçamento de saída barra o replay em modo real, mas NUNCA o webhook genuíno', async () => {
    // Config em modo real: o orçamento passa a valer.
    const configReal = {
      get: (key: string): string | undefined => {
        if (key === 'MP_WEBHOOK_SECRET') return SECRET;
        if (key === 'PAYMENT_PROVIDER') return 'mercadopago';
        return undefined;
      },
    } as unknown as ConfigService;

    const budget = new OutboundBudgetService();
    const svc = new WebhookService(prisma, configReal, stubProvider(orderId, 4700), budget);

    // Esgota o orçamento de replay (5/min).
    for (let i = 0; i < 5; i += 1) {
      budget.consume('replay_lookup', REPLAY_LOOKUP_BUDGET);
    }

    // Replay (source=admin_replay) com o orçamento zerado → 429, sem tocar o provedor.
    await expect(
      svc.process({
        ...signedInput('pay-nao-creditado', 'req-budget-1', nowSeconds),
        source: WebhookSource.admin_replay,
      }),
    ).rejects.toMatchObject({ status: 429 });

    // O webhook GENUÍNO do MP passa mesmo com o orçamento de replay zerado —
    // orçá-lo seria auto-DoS: é o caminho do dinheiro.
    const genuino = await svc.process(signedInput(PAYMENT_ID, 'req-budget-2', nowSeconds));
    expect(genuino.verdict).toBe('processado');
  });

  it('replay de pedido JÁ CREDITADO não consulta o provedor (zero chamada externa)', async () => {
    // Credita de verdade (com o stub normal).
    const primeira = await service.process(signedInput(PAYMENT_ID, 'req-lazy-1', nowSeconds));
    expect(primeira.verdict).toBe('processado');

    // Agora, um provider que explode se for tocado: o crédito já existe no banco,
    // logo o veredito não depende do provedor — a Camada 3 decide sozinha.
    const semRede = new WebhookService(
      prisma,
      fakeConfig,
      explodingProvider(),
      new OutboundBudgetService(),
    );
    const replay = await semRede.process(signedInput(PAYMENT_ID, 'req-lazy-2', nowSeconds));

    expect(replay.verdict).toBe('duplicata_ignorada');
    expect(await prisma.orderCredit.count({ where: { mpPaymentId: PAYMENT_ID } })).toBe(1);
  });

  it('reentrega com request-id já visto não consulta o provedor (dedupe da Camada 2)', async () => {
    await service.process(signedInput(PAYMENT_ID, 'req-lazy-3', nowSeconds));

    const semRede = new WebhookService(
      prisma,
      fakeConfig,
      explodingProvider(),
      new OutboundBudgetService(),
    );
    const reentrega = await semRede.process(signedInput(PAYMENT_ID, 'req-lazy-3', nowSeconds));

    expect(reentrega.verdict).toBe('duplicata_ignorada');
  });

  it('falha transitória de getPayment → 500; reentrega com MESMO request-id credita (finding 1)', async () => {
    const flaky = new WebhookService(
      prisma,
      fakeConfig,
      flakyProvider(orderId, 4700, 1),
      new OutboundBudgetService(),
    );
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
