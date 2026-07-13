import { Injectable, Logger } from '@nestjs/common';

/**
 * Orçamento de CHAMADAS DE SAÍDA ao provedor de pagamento.
 *
 * Por que existe: no modo mock, cada clique da demo custa zero — tudo é local.
 * No modo real, cada clique em `POST /orders` (rota **pública, sem token**, o
 * botão principal da demo) vira uma cobrança de verdade criada na conta do
 * operador no Mercado Pago. Um bot distribuído geraria milhares por dia. O
 * throttler por IP não cobre isso: ele protege o *nosso* processo, não a quota do
 * *terceiro* — e um atacante com IPs rotativos passa por baixo dele.
 *
 * Isto NÃO é rate limit de HTTP: é um teto de quanto esta demo pode gastar contra
 * a conta de outra pessoa. Fail-closed e HONESTO: quando o orçamento acaba, a
 * demo diz que acabou. É proibido cair para o mock em silêncio — mostrar um QR
 * falso alegando sandbox real seria mentir para o avaliador.
 *
 * O webhook GENUÍNO do MP nunca é orçado: é o caminho do dinheiro, e ele já está
 * limitado a montante (o MP só nos notifica sobre cobranças que nós criamos).
 * Orçar o webhook seria auto-DoS.
 */
export interface BudgetWindow {
  readonly limit: number;
  readonly windowMs: number;
}

interface Bucket {
  /** Timestamps (monotônicos) dos consumos ainda dentro da janela. */
  hits: number[];
}

@Injectable()
export class OutboundBudgetService {
  private readonly logger = new Logger(OutboundBudgetService.name);
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Consome uma unidade do orçamento. `false` = esgotado (o chamador DEVE recusar
   * a operação, nunca degradar em silêncio).
   *
   * Relógio monotônico (`performance.now`): imune a ajuste de horário do host.
   */
  consume(key: string, windows: readonly BudgetWindow[]): boolean {
    const now = performance.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };

    // Descarta o que já saiu da maior janela — o balde não cresce sem limite.
    const longest = Math.max(...windows.map((w) => w.windowMs));
    bucket.hits = bucket.hits.filter((t) => now - t < longest);

    for (const window of windows) {
      const dentro = bucket.hits.filter((t) => now - t < window.windowMs).length;
      if (dentro >= window.limit) {
        this.buckets.set(key, bucket);
        this.logger.warn(
          `orçamento de saída esgotado (${key}): ${window.limit} em ${window.windowMs}ms`,
        );
        return false;
      }
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }

  /** Só para teste: zera o estado entre casos. */
  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Criar cobrança é a operação CARA: é ela que cria objeto na conta do provedor.
 * Teto duplo (hora e dia) — a janela de hora contém a rajada, a de dia contém a
 * maratona.
 */
export const CREATE_CHARGE_BUDGET: readonly BudgetWindow[] = [
  { limit: 30, windowMs: 60 * 60 * 1000 },
  { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
];

/**
 * Replay é leitura, e o caminho do wow (pedido já creditado) nem chega a consultar
 * o provedor (ver `remoteLookupNeeded`). Este teto só existe para o resto: evento
 * de pagamento REJEITADO é replayável e não tem crédito — logo consulta o MP de
 * verdade, e o demo-token é público por design.
 */
export const REPLAY_LOOKUP_BUDGET: readonly BudgetWindow[] = [{ limit: 5, windowMs: 60 * 1000 }];
