import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client';

/**
 * Higiene do client: erro HTTP vira mensagem de catálogo fixo — o corpo cru da
 * resposta NUNCA aparece pro usuário (regra global de logging/erro).
 */
describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reduz problem+json a mensagem de catálogo, sem ecoar corpo cru', async () => {
    const corpoInterno = '{"type":"about:blank","detail":"stack interna secreta"}';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(corpoInterno, { status: 404 })));
    const erro = await api.pedido('PIX-inexistente').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(404);
    expect((erro as ApiError).message).toContain('Não encontramos esse pedido');
    expect((erro as ApiError).message).not.toContain('stack interna');
  });

  it('429 vira orientação de espera (rate-limit das rotas admin)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    const erro = await api.simularConfirmacao('PIX-x').catch((e: unknown) => e);
    expect((erro as ApiError).message).toContain('espere um instante');
  });

  it('falha de rede vira mensagem própria, status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const erro = await api.painel().catch((e: unknown) => e);
    expect((erro as ApiError).status).toBe(0);
    expect((erro as ApiError).message).toContain('Sem conexão');
  });

  it('ações admin levam o X-Demo-Token pré-anexado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"verdict":"processado"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.reenviarWebhook('evt-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/webhook-events/evt-1/replay');
    expect(new Headers(init.headers).get('X-Demo-Token')).not.toBeNull();
    expect(init.method).toBe('POST');
  });
});
