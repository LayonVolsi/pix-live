import { describe, expect, it } from 'vitest';
import type { OrderView } from '../src/api/types';
import { intervaloPollingPedido, POLLING_MS } from '../src/lib/polling';

const agora = new Date('2026-07-03T12:00:00.000Z').getTime();

function ordem(overrides: Partial<OrderView>): OrderView {
  return {
    publicRef: 'PIX-a',
    productName: 'Kit',
    amountCents: 4700,
    amountFormatted: 'R$ 47,00',
    status: 'pending',
    qrEmv: 'emv',
    qrPngBase64: null,
    pixExpiresAt: new Date(agora + 60_000).toISOString(),
    ...overrides,
  };
}

describe('política de polling do pedido', () => {
  it('pendente e dentro da validade: 2,5s', () => {
    expect(intervaloPollingPedido(ordem({}), agora)).toBe(POLLING_MS);
  });

  it('estados finais param o polling (pago, cancelado, expirado, rejeitado)', () => {
    for (const status of ['paid', 'cancelled', 'expired', 'rejected']) {
      expect(intervaloPollingPedido(ordem({ status }), agora)).toBe(false);
    }
  });

  it('cobrança vencida no relógio local para o polling mesmo com status pendente', () => {
    const vencida = ordem({ pixExpiresAt: new Date(agora - 1_000).toISOString() });
    expect(intervaloPollingPedido(vencida, agora)).toBe(false);
  });

  it('sem dado ainda (query em voo), não agenda polling', () => {
    expect(intervaloPollingPedido(undefined, agora)).toBe(false);
  });
});
