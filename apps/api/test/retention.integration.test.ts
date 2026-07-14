import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RetentionService, SEED_PUBLIC_REF } from '../src/retention/retention.service.js';
import { makeTestPrisma } from './helpers/test-prisma.js';

const HAS_DB =
  typeof process.env['DATABASE_URL'] === 'string' && process.env['DATABASE_URL'] !== '';

/** Config com janela de 48h — o service lê DEMO_RETENTION_HOURS uma vez, no construtor. */
const config = {
  get: (key: string): unknown => (key === 'DEMO_RETENTION_HOURS' ? 48 : undefined),
} as unknown as ConfigService;

const HOUR = 3_600_000;

describe.skipIf(!HAS_DB)('RetentionService (integração, Postgres real)', () => {
  let prisma: PrismaService;
  let service: RetentionService;
  let productId: string;

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
    service = new RetentionService(prisma, config);

    const product = await prisma.product.create({
      data: { slug: 'kit', name: 'Kit', description: 'demo', amountCents: 4700 },
    });
    productId = product.id;
  });

  /** Cria um pedido com idade controlada e um evento de webhook ligado a ele. */
  async function seedOrder(publicRef: string, ageHours: number): Promise<string> {
    const at = new Date(Date.now() - ageHours * HOUR);
    const order = await prisma.order.create({
      data: {
        publicRef,
        productId,
        amountCents: 4700,
        status: 'paid',
        createdAt: at,
        payerEmail: `${publicRef}@teste.com`,
      },
    });
    await prisma.webhookEvent.create({
      data: {
        receivedAt: at,
        source: 'mercadopago',
        signatureValid: true,
        verdict: 'processado',
        relatedOrderId: order.id,
        processingMs: 5,
      },
    });
    return order.id;
  }

  it('purga pedido de VISITANTE mais velho que a janela, com sua trilha', async () => {
    await seedOrder('PIX-visitante-velho', 72); // > 48h

    const removed = await service.runPurge();

    expect(removed).toBe(1);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.webhookEvent.count()).toBe(0); // a trilha saiu junto
  });

  it('PRESERVA o pedido-demo semeado mesmo velho — o wow não pode morrer', async () => {
    await seedOrder(SEED_PUBLIC_REF, 240); // 10 dias, muito além da janela

    const removed = await service.runPurge();

    expect(removed).toBe(0);
    const seed = await prisma.order.findUnique({ where: { publicRef: SEED_PUBLIC_REF } });
    expect(seed).not.toBeNull();
    // A trilha do seed também sobrevive — senão o caminho rápido da demonstração quebra.
    expect(await prisma.webhookEvent.count()).toBe(1);
  });

  it('não toca pedido de visitante ainda DENTRO da janela', async () => {
    await seedOrder('PIX-visitante-novo', 1); // 1h < 48h

    const removed = await service.runPurge();

    expect(removed).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });

  it('purga o velho e mantém seed e recente na mesma passada', async () => {
    await seedOrder(SEED_PUBLIC_REF, 240);
    await seedOrder('PIX-velho', 72);
    await seedOrder('PIX-novo', 2);

    const removed = await service.runPurge();

    expect(removed).toBe(1);
    const refs = (await prisma.order.findMany({ select: { publicRef: true } }))
      .map((o) => o.publicRef)
      .sort();
    expect(refs).toEqual([SEED_PUBLIC_REF, 'PIX-novo']);
  });

  it('remove a PII (payerEmail) do visitante expirado por construção (a linha some)', async () => {
    await seedOrder('PIX-com-pii', 72);

    await service.runPurge();

    const leftover = await prisma.order.findMany({ where: { payerEmail: { not: null } } });
    expect(leftover.filter((o) => o.publicRef !== SEED_PUBLIC_REF)).toHaveLength(0);
  });
});
