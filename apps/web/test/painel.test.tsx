// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelView } from '../src/api/types';
import { Painel } from '../src/pages/Painel';

const painelMock = vi.hoisted(() => vi.fn());
const reenviarMock = vi.hoisted(() => vi.fn());
vi.mock('../src/api/client', () => ({
  api: { painel: painelMock, reenviarWebhook: reenviarMock },
  ApiError: class extends Error {},
}));

const VIEW: PanelView = {
  orders: [
    {
      publicRef: 'PIX-wow00001',
      productName: 'Kit Caderno Artesanal',
      amountFormatted: 'R$ 47,00',
      status: 'paid',
      payerEmailMasked: 'jo***@teste.com',
      createdAt: '2026-07-03T11:00:00.000Z',
      paidAt: '2026-07-03T11:01:00.000Z',
      processedCount: 1,
      blockedCount: 1,
    },
  ],
  events: [
    {
      id: 'evt-1',
      receivedAt: '2026-07-03T11:01:00.000Z',
      source: 'mercadopago',
      verdict: 'processado',
      signatureValid: true,
      mpPaymentId: 'pay-1',
      orderPublicRef: 'PIX-wow00001',
      processingMs: 12,
    },
    {
      id: 'evt-2',
      receivedAt: '2026-07-03T11:02:00.000Z',
      source: 'admin_replay',
      verdict: 'duplicata_ignorada',
      signatureValid: true,
      mpPaymentId: 'pay-1',
      orderPublicRef: 'PIX-wow00001',
      processingMs: 8,
    },
  ],
};

function renderPainel(): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Painel />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Painel de conciliação', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mostra pedidos com contadores agregados e e-mail já mascarado', async () => {
    painelMock.mockResolvedValue(VIEW);
    render(renderPainel());

    expect(await screen.findByText('jo***@teste.com')).toBeDefined();
    expect(screen.getByText(/processado 1×/)).toBeDefined();
    expect(screen.getByText(/bloqueado 1×/)).toBeDefined();
    // 3 ocorrências: a linha do pedido + os 2 eventos da trilha apontam pra ele.
    expect(screen.getAllByRole('link', { name: 'PIX-wow00001' })).toHaveLength(3);
  });

  it('lista a trilha de webhooks com veredito, assinatura e latência', async () => {
    painelMock.mockResolvedValue(VIEW);
    render(renderPainel());

    expect(await screen.findByText('processado')).toBeDefined();
    expect(screen.getByText('duplicata ignorada')).toBeDefined();
    expect(screen.getAllByText('✓ válida')).toHaveLength(2);
    expect(screen.getByText('12 ms')).toBeDefined();
    expect(screen.getByText(/leitura pública por design/i)).toBeDefined();
  });

  it('replay só em evento processado; C7: pending desabilita e não emite 2ª chamada', async () => {
    painelMock.mockResolvedValue(VIEW);
    let resolver: (v: { verdict: string }) => void = () => undefined;
    reenviarMock.mockImplementation(
      () => new Promise<{ verdict: string }>((resolve) => (resolver = resolve)),
    );
    render(renderPainel());

    // Só o evento 'processado' ganha o botão (o 'duplicata_ignorada' não).
    const botoes = await screen.findAllByRole('button', { name: /reenviar este webhook/i });
    expect(botoes).toHaveLength(1);

    fireEvent.click(botoes[0]!);
    const ocupado = await screen.findByRole('button', { name: /reenviando/i });
    expect(ocupado).toHaveProperty('disabled', true);
    fireEvent.click(ocupado);
    expect(reenviarMock).toHaveBeenCalledTimes(1);
    expect(reenviarMock).toHaveBeenCalledWith('evt-1');

    resolver({ verdict: 'duplicata_ignorada' });
  });
});
