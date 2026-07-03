import type { AdminActionResult, OrderView, PanelView } from './types';

/**
 * Client fino da API. Higiene inegociável: o corpo cru de uma resposta de erro
 * NUNCA chega à UI nem ao console — o problem+json é reduzido a um catálogo
 * fixo de mensagens pt-BR por status. O X-Demo-Token é pré-anexado nas ações
 * admin: token de demonstração pública, NÃO é credencial real (a defesa contra
 * abuso é o rate-limit agressivo do servidor).
 */

const BASE = '/api/v1';
const DEMO_TOKEN: string = (import.meta.env['VITE_DEMO_TOKEN'] as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Catálogo fixo — nada de ecoar detalhe interno/corpo externo pro usuário. */
function mensagemPara(status: number): string {
  if (status === 404) return 'Não encontramos esse pedido. Confira o link ou gere um novo.';
  if (status === 429) return 'Muitas ações em sequência — espere um instante e tente de novo.';
  if (status === 401) return 'Ação de demonstração não autorizada.';
  if (status >= 500) return 'O serviço tropeçou agora. Tente novamente em alguns segundos.';
  return 'Não foi possível completar a ação agora.';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'Sem conexão com o serviço. Verifique sua rede.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, mensagemPara(response.status));
  }
  return (await response.json()) as T;
}

function adminPost(path: string): Promise<AdminActionResult> {
  return request<AdminActionResult>(path, {
    method: 'POST',
    headers: { 'X-Demo-Token': DEMO_TOKEN },
  });
}

export const api = {
  criarPedido: (): Promise<OrderView> => request<OrderView>('/orders', { method: 'POST' }),
  pedido: (publicRef: string): Promise<OrderView> =>
    request<OrderView>(`/orders/${encodeURIComponent(publicRef)}`),
  painel: (): Promise<PanelView> => request<PanelView>('/reconciliation'),
  simularConfirmacao: (publicRef: string): Promise<AdminActionResult> =>
    adminPost(`/admin/orders/${encodeURIComponent(publicRef)}/simulate`),
  reenviarWebhook: (eventId: string): Promise<AdminActionResult> =>
    adminPost(`/admin/webhook-events/${encodeURIComponent(eventId)}/replay`),
};
