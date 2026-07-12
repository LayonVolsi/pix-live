import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '../src/payment/mock-payment-provider.js';
import { OutboundBudgetService } from '../src/payment/outbound-budget.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrdersService } from '../src/orders/orders.service.js';

const HAS_DB =
  typeof process.env['DATABASE_URL'] === 'string' && process.env['DATABASE_URL'] !== '';

/** Modo mock: o orçamento de saída não se aplica (nada custa a ninguém). */
const fakeConfig = {
  get: (key: string): string | undefined => (key === 'PAYMENT_PROVIDER' ? 'mock' : undefined),
} as unknown as ConfigService;

describe.skipIf(!HAS_DB)('OrdersService (integração, Postgres real)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;

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
    await prisma.product.create({
      data: { slug: 'kit', name: 'Kit Caderno Artesanal', description: 'demo', amountCents: 4700 },
    });
    orders = new OrdersService(
      prisma,
      new MockPaymentProvider(),
      new OutboundBudgetService(),
      fakeConfig,
    );
  });

  it('cria pedido pendente com QR e valor formatado', async () => {
    const view = await orders.create();
    expect(view.status).toBe('pending');
    expect(view.amountCents).toBe(4700);
    expect(view.amountFormatted).toBe('R$ 47,00');
    expect(view.qrEmv).toContain('MOCK-PIX');
    expect(view.qrPngBase64?.startsWith('iVBORw0KGgo')).toBe(true);
    expect(view.publicRef.startsWith('PIX-')).toBe(true);
    // Idempotência de saída registrada.
    expect(await prisma.outboundIdempotencyKey.count()).toBe(1);
  });

  it('consulta por referência pública devolve o mesmo pedido', async () => {
    const created = await orders.create();
    const fetched = await orders.getByRef(created.publicRef);
    expect(fetched.publicRef).toBe(created.publicRef);
    expect(fetched.productName).toBe('Kit Caderno Artesanal');
  });

  it('referência inexistente → NotFound', async () => {
    await expect(orders.getByRef('PIX-nao-existe')).rejects.toBeInstanceOf(NotFoundException);
  });
});
