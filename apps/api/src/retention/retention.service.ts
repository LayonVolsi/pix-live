import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * `publicRef` do pedido-demo semeado (ver `prisma/seed.ts`). É o pedido pago com histórico de
 * webhook que sustenta o caminho rápido da demonstração — precisa sobreviver a QUALQUER purga,
 * ou o caminho rápido da demonstração morre depois de uma janela de retenção. É a única linha
 * imortal.
 */
export const SEED_PUBLIC_REF = 'PIX-demopaga';

/** De quanto em quanto a purga roda. De hora em hora é folgado — a janela é medida em dias. */
const PURGE_INTERVAL_MS = 3_600_000;

/**
 * Quantos pedidos por lote. Cada lote é uma transação curta e materializa no máximo estes ids —
 * sem isto, um backlog grande (a demo pública pode gerar volume por abuso) faria uma única
 * transação estourar o timeout do Prisma (5s) e nunca reduzir o backlog. Ver review forense.
 */
const PURGE_BATCH = 1000;

/**
 * Retenção da demo. O que ela FECHA: pedidos e trilha gerados por VISITANTE crescendo sem teto
 * numa vitrine pública e persistente. O que ela NÃO fecha, de propósito (riscos aceitos,
 * escopados no SECURITY.md §9):
 *  - a trilha do pedido-demo semeado, que é imortal por design — replay público acumula linhas
 *    ligadas a ele; o dado é sintético (não é PII de visitante), o limite é decisão de produto;
 *  - não é um mecanismo de exclusão a pedido do titular (LGPD art. 18) — é retenção por idade.
 *
 * Nota honesta: hoje `Order.payerEmail` só é gravado pelo seed (e-mail sintético). Nenhum fluxo
 * de runtime grava e-mail de visitante. A purga PROTEGE esse campo caso um dia passe a ser
 * preenchido — não remedia PII que já esteja no banco, porque não há.
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
   * Purga os pedidos de visitante expirados e sua trilha. Retorna o total removido. Público
   * para o teste exercitar sem esperar o timer.
   *
   * Escala por construção: eventos órfãos saem num DELETE direto (o banco resolve, nada
   * materializa no cliente); os pedidos saem em LOTES, cada lote numa transação própria. Um
   * lote que falhe (ex.: corrida com escrita concorrente violando a FK RESTRICT) não perde os
   * lotes já commitados — a purga é idempotente e a próxima janela retoma o resto.
   */
  async runPurge(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionHours * 3_600_000);

    // Eventos órfãos antigos (sem pedido): DELETE direto, sem materializar ids. NUNCA por idade
    // global de TODOS os eventos — os do seed são antigos por design e têm de sobreviver; estes
    // são só os que já não apontam para pedido nenhum.
    await this.prisma.webhookEvent.deleteMany({
      where: { relatedOrderId: null, receivedAt: { lt: cutoff } },
    });

    let total = 0;
    for (;;) {
      const removed = await this.purgeOrderBatch(cutoff);
      total += removed;
      if (removed < PURGE_BATCH) break; // último lote incompleto → acabou
    }
    return total;
  }

  /**
   * Um lote de até `PURGE_BATCH` pedidos, atômico. As relações não têm `onDelete: Cascade`
   * (default é restringir), então os filhos saem antes do pai, em ordem.
   */
  private purgeOrderBatch(cutoff: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.order.findMany({
        where: { createdAt: { lt: cutoff }, publicRef: { not: SEED_PUBLIC_REF } },
        select: { id: true },
        take: PURGE_BATCH,
      });
      const ids = expired.map((o) => o.id);
      if (ids.length === 0) return 0;

      await tx.webhookEvent.deleteMany({ where: { relatedOrderId: { in: ids } } });
      await tx.orderCredit.deleteMany({ where: { orderId: { in: ids } } });
      await tx.outboundIdempotencyKey.deleteMany({ where: { orderId: { in: ids } } });
      await tx.order.deleteMany({ where: { id: { in: ids } } });

      return ids.length;
    });
  }
}
