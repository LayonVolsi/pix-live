import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { makeTestPrisma } from './helpers/test-prisma.js';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service.js';

const HAS_DB =
  typeof process.env['DATABASE_URL'] === 'string' && process.env['DATABASE_URL'] !== '';

describe.skipIf(!HAS_DB)('ReconciliationService (integração, Postgres real)', () => {
  let prisma: PrismaService;
  let service: ReconciliationService;

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
    service = new ReconciliationService(prisma);

    const product = await prisma.product.create({
      data: { slug: 'kit', name: 'Kit Caderno Artesanal', description: 'demo', amountCents: 4700 },
    });
    const order = await prisma.order.create({
      data: {
        publicRef: 'ref-rec',
        productId: product.id,
        amountCents: 4700,
        status: 'paid',
        payerEmail: 'joana@teste.com',
        mpPaymentId: 'pay-rec-1',
        paidAt: new Date(),
      },
    });
    // Um evento processado + um bloqueado (o wow: processado 1× · bloqueado 1×).
    await prisma.webhookEvent.createMany({
      data: [
        {
          source: 'mercadopago',
          signatureValid: true,
          verdict: 'processado',
          mpPaymentId: 'pay-rec-1',
          relatedOrderId: order.id,
          requestIdHeader: 'r1',
          processingMs: 10,
          rawBody: '{}',
        },
        {
          source: 'admin_replay',
          signatureValid: true,
          verdict: 'duplicata_ignorada',
          mpPaymentId: 'pay-rec-1',
          relatedOrderId: order.id,
          requestIdHeader: 'r2',
          processingMs: 8,
          rawBody: '{}',
        },
      ],
    });
  });

  it('painel mascara o e-mail no backend e agrega os contadores por veredito', async () => {
    const view = await service.panel();
    const order = view.orders.find((o) => o.publicRef === 'ref-rec');
    expect(order).toBeDefined();
    expect(order?.payerEmailMasked).toBe('jo***@teste.com');
    expect(order?.processedCount).toBe(1);
    expect(order?.blockedCount).toBe(1);
    // O log de eventos aparece, com validade de assinatura e latência.
    expect(view.events.length).toBeGreaterThanOrEqual(2);
    expect(view.events.every((e) => e.signatureValid)).toBe(true);
  });

  it('expõe id do evento e o vínculo com o pedido via publicRef (contrato do front)', async () => {
    const view = await service.panel();
    const processed = view.events.find((e) => e.verdict === 'processado');
    expect(processed).toBeDefined();
    // id é o handle do replay (rota /admin); orderPublicRef liga evento→pedido
    // sem expor PK interno.
    expect(processed?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(processed?.orderPublicRef).toBe('ref-rec');
  });
});
