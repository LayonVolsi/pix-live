import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '../src/payment/mock-payment-provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
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
    prisma = new PrismaService();
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
    const webhook = new WebhookService(prisma, fakeConfig, mock);
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

  it('replay de um evento já processado → duplicata, crédito continua 1× (o wow)', async () => {
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
});
