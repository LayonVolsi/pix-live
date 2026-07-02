import type { Verdict } from './types.js';

/**
 * Camadas 2 e 3: anti-replay e idempotência de crédito.
 *
 * Esta é a decisão PURA — dados os fatos já apurados (assinatura válida?
 * request-id já visto? crédito já existe?), qual o veredito. O crédito de fato
 * (constraint de unicidade em transação) mora no adapter de banco; aqui só a
 * regra que ninguém deve conseguir contornar.
 */
export interface WebhookEvaluation {
  /** Camada 1 já apurada: HMAC bateu? */
  readonly signatureValid: boolean;
  /** Camada 2: esse delivery-id (x-request-id) já foi processado? */
  readonly requestIdAlreadyProcessed: boolean;
  /** O pagamento referencia um pedido conhecido? */
  readonly orderKnown: boolean;
  /** Camada 3: já existe crédito para esse mp_payment_id? */
  readonly creditAlreadyExists: boolean;
  /** O `ts` da assinatura caiu dentro da janela anti-replay? */
  readonly tsWithinWindow: boolean;
}

/**
 * Decide o veredito. Ordem é intencional e testada:
 * assinatura inválida barra tudo; depois dedupe por request-id; depois pedido
 * desconhecido; depois idempotência de crédito; `ts` fora da janela vira SINAL
 * (não rejeição) quando o HMAC é válido — ver adr/0002.
 */
export function decideVerdict(e: WebhookEvaluation): Verdict {
  if (!e.signatureValid) return 'assinatura_invalida';
  if (e.requestIdAlreadyProcessed) return 'duplicata_ignorada';
  if (!e.orderKnown) return 'pagamento_desconhecido';
  if (e.creditAlreadyExists) return 'duplicata_ignorada';
  if (!e.tsWithinWindow) return 'ts_suspeito';
  return 'processado';
}

/** Um veredito credita o pedido? (o "processado" e o "processado-mas-suspeito"). */
export function verdictResultsInCredit(v: Verdict): boolean {
  return v === 'processado' || v === 'ts_suspeito';
}

/**
 * Status HTTP a devolver ao provedor.
 * 401 só para assinatura inválida; 5xx só para erro interno; todo o resto é 200
 * (ack) para o provedor parar de reentregar — a reentrega é inofensiva porque o
 * processamento é idempotente.
 */
export function httpStatusForVerdict(v: Verdict): 200 | 401 | 500 {
  if (v === 'assinatura_invalida') return 401;
  if (v === 'erro') return 500;
  return 200;
}

/**
 * A janela anti-replay é generosa por padrão (24h) até a semântica exata do
 * campo `ts` do MP ser confirmada — ver adr/0002. `now` é injetado (nunca
 * `Date.now()` no domínio) para manter a função pura e testável.
 */
export const DEFAULT_ANTI_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isTimestampWithinWindow(
  tsSeconds: number,
  nowMs: number,
  windowMs: number = DEFAULT_ANTI_REPLAY_WINDOW_MS,
): boolean {
  if (!Number.isFinite(tsSeconds) || !Number.isFinite(nowMs)) return false;
  return Math.abs(nowMs - tsSeconds * 1000) <= windowMs;
}
