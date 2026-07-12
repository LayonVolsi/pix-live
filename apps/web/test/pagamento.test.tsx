// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderView } from '../src/api/types';
import { BotaoCopiar } from '../src/components/BotaoCopiar';
import { Pagamento } from '../src/pages/Pagamento';

const pedidoMock = vi.hoisted(() => vi.fn());
const simularMock = vi.hoisted(() => vi.fn());
const configMock = vi.hoisted(() => vi.fn());
vi.mock('../src/api/client', () => ({
  api: { pedido: pedidoMock, simularConfirmacao: simularMock, config: configMock },
  ApiError: class extends Error {},
}));

// Modo mock em todos os casos: é onde o botão "simular" faz sentido. No sandbox
// real ele some (botão que só falha é pior que botão ausente) — ver ConfigController.
beforeEach(() => {
  configMock.mockResolvedValue({ paymentProvider: 'mock', canSimulatePayment: true });
});

function baseOrder(overrides: Partial<OrderView>): OrderView {
  return {
    publicRef: 'PIX-abc123',
    productName: 'Kit Caderno Artesanal',
    amountCents: 4700,
    amountFormatted: 'R$ 47,00',
    status: 'pending',
    qrEmv: '00020126MOCKEMV',
    qrPngBase64: 'iVBORw0KGgoAAAANSUhEUg==',
    pixExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function renderPagamento(): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/pedido/PIX-abc123']}>
        <Routes>
          <Route element={<Pagamento />} path="/pedido/:publicRef" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Pagamento — cupom estático', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renderiza QR, copia-e-cola, valor e contador enquanto aguarda', async () => {
    pedidoMock.mockResolvedValue(baseOrder({}));
    render(renderPagamento());

    expect(await screen.findByRole('img', { name: /qr code pix/i })).toBeDefined();
    expect(screen.getByText('00020126MOCKEMV')).toBeDefined();
    expect(screen.getByText('R$ 47,00')).toBeDefined();
    expect(screen.getByRole('timer', { name: /tempo restante/i }).textContent).toMatch(
      /^\d{2}:\d{2}$/,
    );
    expect(screen.getByText('Aguardando pagamento')).toBeDefined();
  });

  it('contador vira "expirada" quando o relógio passa do pixExpiresAt', async () => {
    vi.useFakeTimers();
    pedidoMock.mockResolvedValue(
      baseOrder({ pixExpiresAt: new Date(Date.now() + 2_000).toISOString() }),
    );
    render(renderPagamento());

    // resolve a query sob fake timers
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('timer', { name: /tempo restante/i })).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText('expirada')).toBeDefined();
    expect(screen.getByText(/a cobrança expirou/i)).toBeDefined();
  });

  it('pedido pago não mostra QR nem contador — só o carimbo Pago', async () => {
    pedidoMock.mockResolvedValue(baseOrder({ status: 'paid' }));
    render(renderPagamento());

    expect(await screen.findByText('Pago')).toBeDefined();
    expect(screen.queryByRole('img', { name: /qr code/i })).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByRole('button', { name: /simular confirmação/i })).toBeNull();
  });

  it('simular: desabilita em isPending, duplo-clique não emite 2ª chamada (C7)', async () => {
    pedidoMock.mockResolvedValue(baseOrder({}));
    let resolver: (v: { verdict: string }) => void = () => undefined;
    simularMock.mockImplementation(
      () => new Promise<{ verdict: string }>((resolve) => (resolver = resolve)),
    );
    render(renderPagamento());

    const botao = await screen.findByRole('button', { name: /simular confirmação/i });
    fireEvent.click(botao);
    const ocupado = await screen.findByRole('button', { name: /emitindo webhook/i });
    expect(ocupado).toHaveProperty('disabled', true);
    fireEvent.click(ocupado);
    expect(simularMock).toHaveBeenCalledTimes(1);
    expect(simularMock).toHaveBeenCalledWith('PIX-abc123');

    resolver({ verdict: 'processado' });
  });

  it('rótulo do token de demonstração está na copy (C8)', async () => {
    pedidoMock.mockResolvedValue(baseOrder({}));
    render(renderPagamento());
    await screen.findByRole('button', { name: /simular confirmação/i });
    expect(screen.getByText(/token de demonstração pública/i)).toBeDefined();
    expect(screen.getByText(/não é credencial real/i)).toBeDefined();
  });
});

describe('BotaoCopiar', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    writeText.mockReset();
  });

  it('copia o EMV e dá feedback textual', async () => {
    render(<BotaoCopiar texto="00020126MOCKEMV" />);
    fireEvent.click(screen.getByRole('button', { name: /copiar código/i }));
    expect(await screen.findByRole('button', { name: /copiado/i })).toBeDefined();
    expect(writeText).toHaveBeenCalledWith('00020126MOCKEMV');
  });
});
