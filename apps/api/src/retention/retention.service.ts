import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * `publicRef` do pedido-demo semeado (ver `prisma/seed.ts`). É o pedido pago com histórico de
 * webhook que sustenta o caminho rápido da demonstração — precisa sobreviver a QUALQUER purga,
 * ou o wow do painel morre depois de uma janela de retenção. É a única linha imortal.
 */
export const SEED_PUBLIC_REF = 'PIX-demopaga';

/** De quanto em quanto a purga roda. De hora em hora é folgado — a janela é medida em dias. */
const PURGE_INTERVAL_MS = 3_600_000;

/**
 * Retenção da demo. Sem isto, uma vitrine pública e persistente acumula `webhook_events`
 * (corpo cru em TEXT) sem teto e retém `payerEmail` do modo real indefinidamente — os dois são
 * bloqueio de deploy público, não estética (o próprio SECURITY.md §9 aceitava a ausência SÓ
 * enquanto "não há PII real em jogo", premissa que publicar a demo invalida).
 *
 * Purga pedidos gerados por VISITANTE mais velhos que a janela, com toda a sua trilha. O seed é
 * preservado por `publicRef`; a trilha do seed também, porque só apagamos eventos ligados aos
 * pedidos que estão saindo (ou órfãos antigos), nunca por idade global.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionHours: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.retentionHours = config.get<number>('DEMO_RETENTION_HOURS') ?? 48;
  }

  @Interval(PURGE_INTERVAL_MS)
  async purgeExpired(): Promise<void> {
    try {
      const removed = await this.runPurge();
      if (removed > 0) {
        this.logger.log(`Retenção: ${removed} pedido(s) de visitante expirado(s) purgado(s).`);
      }
    } catch (error) {
      // Purga é higiene de fundo: uma falha não pode derrubar a app nem escalar. Loga e segue;
      // a próxima janela tenta de novo.
      this.logger.error(
        'Retenção: purga falhou (segue na próxima janela)',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Apaga, numa transação, os pedidos de visitante expirados e sua trilha. As relações não têm
   * `onDelete: Cascade` (default é restringir), então os filhos saem antes do pai, em ordem.
   * Retorna quantos pedidos foram removidos. Público para o teste exercitar sem esperar o timer.
   */
  async runPurge(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionHours * 3_600_000);

    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.order.findMany({
        where: { createdAt: { lt: cutoff }, publicRef: { not: SEED_PUBLIC_REF } },
        select: { id: true },
      });
      const ids = expired.map((o) => o.id);
      if (ids.length === 0) return 0;

      // Trilha dos pedidos que saem + eventos órfãos antigos (sem pedido). NUNCA por idade
      // global: os eventos do seed são antigos por design e têm de sobreviver.
      await tx.webhookEvent.deleteMany({
        where: {
          OR: [
            { relatedOrderId: { in: ids } },
            { relatedOrderId: null, receivedAt: { lt: cutoff } },
          ],
        },
      });
      await tx.orderCredit.deleteMany({ where: { orderId: { in: ids } } });
      await tx.outboundIdempotencyKey.deleteMany({ where: { orderId: { in: ids } } });
      await tx.order.deleteMany({ where: { id: { in: ids } } });

      return ids.length;
    });
  }
}
