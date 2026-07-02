import { Injectable } from '@nestjs/common';
import { formatBRL } from '@pix-live/core';
import { maskEmail } from '../common/mask-email.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PanelOrder {
  readonly publicRef: string;
  readonly productName: string;
  readonly amountFormatted: string;
  readonly status: string;
  readonly payerEmailMasked: string | null;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly processedCount: number;
  readonly blockedCount: number;
}

export interface PanelEvent {
  readonly receivedAt: string;
  readonly source: string;
  readonly verdict: string;
  readonly signatureValid: boolean;
  readonly mpPaymentId: string | null;
  readonly processingMs: number;
}

export interface PanelView {
  readonly orders: readonly PanelOrder[];
  readonly events: readonly PanelEvent[];
}

/**
 * Observabilidade de domínio de primeira classe: o painel de conciliação. Público
 * por design (leitura), mas o e-mail do pagador é mascarado NO BACKEND. Contadores
 * derivados por agregação de vereditos (nunca campo mutável solto) — é daqui que
 * sai o "processado 1× · bloqueado 1×" do wow.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async panel(): Promise<PanelView> {
    const [orders, events, counts] = await Promise.all([
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { product: true },
      }),
      this.prisma.webhookEvent.findMany({ orderBy: { receivedAt: 'desc' }, take: 100 }),
      this.prisma.webhookEvent.groupBy({
        by: ['relatedOrderId', 'verdict'],
        _count: { _all: true },
      }),
    ]);

    // Contadores por pedido, agregados dos vereditos (API tipada, sem SQL cru).
    const byOrder = new Map<string, { processed: number; blocked: number }>();
    for (const c of counts) {
      if (c.relatedOrderId === null) continue;
      const acc = byOrder.get(c.relatedOrderId) ?? { processed: 0, blocked: 0 };
      if (c.verdict === 'processado') acc.processed += c._count._all;
      else if (c.verdict === 'duplicata_ignorada') acc.blocked += c._count._all;
      byOrder.set(c.relatedOrderId, acc);
    }

    return {
      orders: orders.map((o) => {
        const counters = byOrder.get(o.id) ?? { processed: 0, blocked: 0 };
        return {
          publicRef: o.publicRef,
          productName: o.product.name,
          amountFormatted: formatBRL(o.amountCents),
          status: o.status,
          payerEmailMasked: maskEmail(o.payerEmail),
          createdAt: o.createdAt.toISOString(),
          paidAt: o.paidAt?.toISOString() ?? null,
          processedCount: counters.processed,
          blockedCount: counters.blocked,
        };
      }),
      events: events.map((e) => ({
        receivedAt: e.receivedAt.toISOString(),
        source: e.source,
        verdict: e.verdict,
        signatureValid: e.signatureValid,
        mpPaymentId: e.mpPaymentId,
        processingMs: e.processingMs,
      })),
    };
  }
}
