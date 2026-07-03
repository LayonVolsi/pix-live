import type { OrderView } from '../api/types';
import { msRestante } from './tempo';

/** 2,5s: "ao vivo" percebido, 24 req/min — folga ampla no throttle por rota+IP. */
export const POLLING_MS = 2500;

/**
 * Política de polling da página de pagamento: só enquanto há o que esperar
 * (pedido pendente e cobrança não expirada). Estados finais param o polling —
 * request de sobra é custo no free tier, não "ao vivo".
 */
export function intervaloPollingPedido(
  ordem: OrderView | undefined,
  agoraMs: number,
): number | false {
  if (ordem?.status !== 'pending') return false;
  if (ordem.pixExpiresAt !== null && msRestante(ordem.pixExpiresAt, agoraMs) <= 0) return false;
  return POLLING_MS;
}
