import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { formatBRL } from '@pix-live/core';
import { PAYMENT_PROVIDER } from '../payment/payment-provider.port.js';
import type { PaymentProvider } from '../payment/payment-provider.port.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Validade da cobrança Pix (15 min) — o contador da UI conta a partir disto. */
const PIX_EXPIRY_SECONDS = 15 * 60;

/** Projeção pública de um pedido (nunca expõe campos crus/PII). */
export interface OrderView {
  readonly publicRef: string;
  readonly productName: string;
  readonly amountCents: number;
  readonly amountFormatted: string;
  readonly status: string;
  readonly qrEmv: string | null;
  readonly qrPngBase64: string | null;
  readonly pixExpiresAt: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Cria o pedido do produto fixo e gera a cobrança Pix no provedor. */
  async create(): Promise<OrderView> {
    const product = await this.prisma.product.findFirst({ where: { active: true } });
    if (product === null) {
      throw new NotFoundException('nenhum produto ativo configurado');
    }

    const publicRef = `PIX-${randomUUID().slice(0, 8)}`;
    const draft = await this.prisma.order.create({
      data: {
        publicRef,
        productId: product.id,
        amountCents: product.amountCents,
        status: 'pending',
      },
    });

    // X-Idempotency-Key = id do pedido: retry de rede não duplica a cobrança.
    const charge = await this.provider.createPixCharge({
      orderId: draft.id,
      amountCents: product.amountCents,
      description: product.name,
      expiresInSeconds: PIX_EXPIRY_SECONDS,
    });

    const order = await this.prisma.order.update({
      where: { id: draft.id },
      data: {
        mpPaymentId: charge.providerPaymentId,
        qrEmv: charge.qrEmv,
        qrPngBase64: charge.qrPngBase64,
        pixExpiresAt: charge.expiresAt,
      },
    });

    // Trilha de idempotência de SAÍDA (uma cobrança por pedido).
    await this.prisma.outboundIdempotencyKey.create({
      data: {
        key: draft.id,
        orderId: draft.id,
        providerResponseSnapshot: { providerPaymentId: charge.providerPaymentId },
      },
    });

    return this.toView(order, product.name);
  }

  /** Consulta por referência pública — usado pelo polling curto da página de pagamento. */
  async getByRef(publicRef: string): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { publicRef },
      include: { product: true },
    });
    if (order === null) {
      throw new NotFoundException('pedido não encontrado');
    }
    return this.toView(order, order.product.name);
  }

  private toView(order: Order, productName: string): OrderView {
    return {
      publicRef: order.publicRef,
      productName,
      amountCents: order.amountCents,
      amountFormatted: formatBRL(order.amountCents),
      status: order.status,
      qrEmv: order.qrEmv,
      qrPngBase64: order.qrPngBase64,
      pixExpiresAt: order.pixExpiresAt?.toISOString() ?? null,
    };
  }
}
