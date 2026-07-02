import type { MpPaymentStatus, OrderStatus } from './types.js';

/**
 * Máquina de estados do pedido. Cobre TODAS as transições que o MP pode
 * disparar, não só approved→paid. Estados terminais são idempotentes: reentrega
 * tardia não reabre um pedido já resolvido.
 */
export interface Transition {
  readonly next: OrderStatus;
  /** `false` quando o evento não altera o estado (só vira log). */
  readonly changed: boolean;
  readonly reason: string;
}

const TERMINAL: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'paid',
  'rejected',
  'cancelled',
  'expired',
]);

/** Transição a partir de um evento de status de pagamento do MP. */
export function nextOrderStatus(current: OrderStatus, event: MpPaymentStatus): Transition {
  if (TERMINAL.has(current)) {
    return {
      next: current,
      changed: false,
      reason: 'pedido em estado terminal — ignorado (idempotente)',
    };
  }

  if (current === 'draft') {
    return {
      next: current,
      changed: false,
      reason: 'evento de pagamento antes da cobrança criada — ignorado',
    };
  }

  // current === 'pending'
  switch (event) {
    case 'approved':
      return { next: 'paid', changed: true, reason: 'pagamento aprovado' };
    case 'rejected':
      return { next: 'rejected', changed: true, reason: 'pagamento rejeitado' };
    case 'cancelled':
      return { next: 'cancelled', changed: true, reason: 'pagamento cancelado' };
    case 'in_process':
      return {
        next: 'pending',
        changed: false,
        reason: 'pagamento em análise — sem mudança de estado',
      };
    case 'pending':
      return { next: 'pending', changed: false, reason: 'ainda pendente — sem mudança de estado' };
    case 'refunded':
    case 'charged_back':
      return {
        next: 'pending',
        changed: false,
        reason: 'estorno/chargeback fora de escopo — só log',
      };
    /* c8 ignore next 2 -- exaustividade garantida pelo tipo; guarda defensiva contra status novo do provedor */
    default:
      return assertNever(event);
  }
}

/**
 * Expiração do Pix é dirigida por tempo, não por webhook: um pedido `pending`
 * cujo `pix_expires_at` já passou vira `expired`. `now` injetado (função pura).
 */
export function applyPixExpiry(
  current: OrderStatus,
  pixExpiresAtMs: number,
  nowMs: number,
): Transition {
  if (current !== 'pending') {
    return { next: current, changed: false, reason: 'só pedidos pendentes expiram' };
  }
  if (nowMs >= pixExpiresAtMs) {
    return { next: 'expired', changed: true, reason: 'cobrança Pix expirada' };
  }
  return { next: current, changed: false, reason: 'cobrança ainda válida' };
}

/* c8 ignore start -- guarda de exaustividade: inatingível enquanto o tipo cobrir todos os casos */
function assertNever(value: never): never {
  throw new TypeError(`status de pagamento não tratado: ${JSON.stringify(value)}`);
}
/* c8 ignore stop */
