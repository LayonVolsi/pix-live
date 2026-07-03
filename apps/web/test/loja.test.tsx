// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderView } from '../src/api/types';
import { Loja } from '../src/pages/Loja';

const criarPedido = vi.hoisted(() => vi.fn());
vi.mock('../src/api/client', () => ({
  api: { criarPedido },
  ApiError: class extends Error {},
}));

function renderLoja(): ReactElement {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Loja />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Loja — botão de mutação (C7)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('desabilita durante isPending: duplo-clique não emite segunda chamada', async () => {
    let resolver: (v: OrderView) => void = () => undefined;
    criarPedido.mockImplementation(() => new Promise<OrderView>((resolve) => (resolver = resolve)));
    render(renderLoja());

    const botao = screen.getByRole('button', { name: /pagar com pix/i });
    fireEvent.click(botao);

    // Pending: rotulado como ocupado, desabilitado, e o 2º clique é inerte.
    const ocupado = await screen.findByRole('button', { name: /gerando cobrança/i });
    expect(ocupado).toHaveProperty('disabled', true);
    fireEvent.click(ocupado);
    expect(criarPedido).toHaveBeenCalledTimes(1);

    resolver({
      publicRef: 'PIX-teste',
      productName: 'Kit',
      amountCents: 4700,
      amountFormatted: 'R$ 47,00',
      status: 'pending',
      qrEmv: null,
      qrPngBase64: null,
      pixExpiresAt: null,
    });
  });

  it('erro da mutação vira alerta com a mensagem do catálogo', async () => {
    criarPedido.mockRejectedValue(new Error('qualquer'));
    render(renderLoja());
    fireEvent.click(screen.getByRole('button', { name: /pagar com pix/i }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Não foi possível criar o pedido');
  });
});
