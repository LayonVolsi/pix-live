import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '../src/payment/mock-payment-provider.js';
import { OutboundBudgetService } from '../src/payment/outbound-budget.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { makeTestPrisma } from './helpers/test-prisma.js';
import { WebhookService } from '../src/webhook/webhook.service.js';
import { AdminService } from '../src/admin/admin.service.js';

const HAS_DB =
  typeof process.env['DATABASE_URL'] === 'string' && process.env['DATABASE_URL'] !== '';
const SECRET = 'segredo-de-teste-abcdef123456';

describe.skipIf(!HAS_DB)('AdminService (integração, Postgres real)', () => {
  let prisma: PrismaService;
  let mock: MockPaymentProvider;
  let admin: AdminService;
  let orderId: string;
  let publicRef: string;
  const fakeConfig = {
    get: (key: string): string | undefined => (key === 'MP_WEBHOOK_SECRET' ? SECRET : undefined),
  } as unknown as ConfigService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.orderCredit.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await prisma.outboundIdempotencyKey.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();

    // Mesma instância do mock nos dois serviços (singleton no app real).
    mock = new MockPaymentProvider();
    const webhook = new WebhookService(prisma, fakeConfig, mock, new OutboundBudgetService());
    admin = new AdminService(prisma, fakeConfig, webhook, mock);

    const product = await prisma.product.create({
      data: { slug: 'kit', name: 'Kit', description: 'demo', amountCents: 4700 },
    });
    // Fluxo real: pedido criado, depois a cobrança gera o mp_payment_id.
    const draft = await prisma.order.create({
      data: { publicRef: 'ref-adm', productId: product.id, amountCents: 4700, status: 'pending' },
    });
    const charge = await mock.createPixCharge({
      orderId: draft.id,
      amountCents: 4700,
      description: 'Kit',
      expiresInSeconds: 900,
    });
    const order = await prisma.order.update({
      where: { id: draft.id },
      data: { mpPaymentId: charge.providerPaymentId },
    });
    orderId = order.id;
    publicRef = order.publicRef;
  });

  it('simular confirmação credita e marca o pedido como pago', async () => {
    const out = await admin.simulate(publicRef);
    expect(out.verdict).toBe('processado');
    expect(await prisma.orderCredit.count()).toBe(1);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('paid');
  });

  it('replay de um evento já processado → duplicata, crédito continua 1× (a demonstração)', async () => {
    await admin.simulate(publicRef);
    const processed = await prisma.webhookEvent.findFirstOrThrow({
      where: { verdict: 'processado' },
    });
    const replayed = await admin.replay(processed.id);
    expect(replayed.verdict).toBe('duplicata_ignorada');
    expect(await prisma.orderCredit.count()).toBe(1);
    // O replay foi gravado com source=admin_replay (isolamento da origem).
    const adminEvent = await prisma.webhookEvent.findFirst({ where: { source: 'admin_replay' } });
    expect(adminEvent).not.toBeNull();
  });

  it('replay com provider que esqueceu o pagamento (restart) → duplicata, nunca pagamento_desconhecido', async () => {
    // O cenário da demonstração SEMEADA (achado da verificação Docker-on 2026-07-03):
    // crédito e evento processado existem no BANCO, mas o Map em memória do
    // mock NUNCA viu ESTE pagamento (só o do fixture) — o estado de qualquer
    // processo novo da API (restart, deploy) diante do pedido plantado pelo
    // seed. O ledger do banco vence o conhecimento transitório do provedor:
    // duplicata, crédito segue 1×.
    const product = await prisma.product.findFirstOrThrow();
    const order = await prisma.order.create({
      data: {
        publicRef: 'ref-restart',
        productId: product.id,
        amountCents: 4700,
        status: 'paid',
        mpPaymentId: 'pay-restart-0001',
        paidAt: new Date(),
      },
    });
    await prisma.orderCredit.create({
      data: { orderId: order.id, mpPaymentId: 'pay-restart-0001', amountCents: 4700 },
    });
    const event = await prisma.webhookEvent.create({
      data: {
        source: 'mercadopago',
        signatureValid: true,
        verdict: 'processado',
        mpPaymentId: 'pay-restart-0001',
        relatedOrderId: order.id,
        requestIdHeader: 'restart-delivery-1',
        tsFromSignature: String(Math.floor(Date.now() / 1000)),
        processingMs: 1,
        rawBody: '{"type":"payment","data":{"id":"pay-restart-0001"}}',
      },
    });

    const replayed = await admin.replay(event.id);
    expect(replayed.verdict).toBe('duplicata_ignorada');
    expect(await prisma.orderCredit.count({ where: { mpPaymentId: 'pay-restart-0001' } })).toBe(1);
  });

  it('replay de evento não-processado é rejeitado (fail-closed, mesmo limite da UI)', async () => {
    await admin.simulate(publicRef);
    const processed = await prisma.webhookEvent.findFirstOrThrow({
      where: { verdict: 'processado' },
    });
    // Gera uma duplicata e tenta reenviá-la: a API recusa antes do pipeline.
    await admin.replay(processed.id);
    const duplicate = await prisma.webhookEvent.findFirstOrThrow({
      where: { verdict: 'duplicata_ignorada' },
    });
    await expect(admin.replay(duplicate.id)).rejects.toThrow(
      'só eventos processados podem ser reenviados',
    );
    expect(await prisma.orderCredit.count()).toBe(1);
  });
});
