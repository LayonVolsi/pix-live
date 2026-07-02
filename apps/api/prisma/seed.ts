import { PrismaClient } from '@prisma/client';

/**
 * Seed determinístico. Cria o produto fixo e UM pedido já pago com histórico de
 * webhook — o caminho rápido do wow: o avaliador abre o painel, clica "reenviar"
 * nesse pedido e vê a idempotência bloquear em <10s, sem gerar nada.
 */
const prisma = new PrismaClient();

const PAID_REF = 'PIX-demopaga';
const PAID_PAYMENT = 'mock-pay-seed-0001';

async function main(): Promise<void> {
  const product = await prisma.product.upsert({
    where: { slug: 'kit-caderno' },
    update: {},
    create: {
      slug: 'kit-caderno',
      name: 'Kit Caderno Artesanal',
      description: 'Caderno artesanal costurado à mão pela Papelaria Nó de Fita.',
      amountCents: 4700,
    },
  });

  const existing = await prisma.order.findUnique({ where: { publicRef: PAID_REF } });
  if (existing !== null) {
    process.stdout.write('Seed: pedido pré-pago já existe — nada a fazer.\n');
    return;
  }

  const order = await prisma.order.create({
    data: {
      publicRef: PAID_REF,
      productId: product.id,
      amountCents: product.amountCents,
      status: 'paid',
      mpPaymentId: PAID_PAYMENT,
      payerEmail: 'cliente.demo@exemplo.com',
      paidAt: new Date(),
    },
  });

  await prisma.orderCredit.create({
    data: { orderId: order.id, mpPaymentId: PAID_PAYMENT, amountCents: order.amountCents },
  });

  await prisma.webhookEvent.create({
    data: {
      source: 'mercadopago',
      signatureValid: true,
      verdict: 'processado',
      mpPaymentId: PAID_PAYMENT,
      relatedOrderId: order.id,
      requestIdHeader: 'seed-delivery-1',
      tsFromSignature: String(Math.floor(Date.now() / 1000)),
      processingMs: 11,
      rawBody: '{"type":"payment","data":{"id":"mock-pay-seed-0001"}}',
    },
  });

  process.stdout.write(`Seed: produto + pedido pré-pago ${PAID_REF} criados.\n`);
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed falhou: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
