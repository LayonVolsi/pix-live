import { describe, expect, it } from 'vitest';
import { applyPixExpiry, nextOrderStatus } from '../src/order-state-machine.js';
import type { MpPaymentStatus, OrderStatus } from '../src/types.js';

describe('nextOrderStatus a partir de pending', () => {
  it('approved → paid (com mudança)', () => {
    expect(nextOrderStatus('pending', 'approved')).toMatchObject({ next: 'paid', changed: true });
  });

  it('rejected → rejected', () => {
    expect(nextOrderStatus('pending', 'rejected')).toMatchObject({
      next: 'rejected',
      changed: true,
    });
  });

  it('cancelled → cancelled', () => {
    expect(nextOrderStatus('pending', 'cancelled')).toMatchObject({
      next: 'cancelled',
      changed: true,
    });
  });

  it('in_process e pending não mudam o estado (só log)', () => {
    expect(nextOrderStatus('pending', 'in_process')).toMatchObject({
      next: 'pending',
      changed: false,
    });
    expect(nextOrderStatus('pending', 'pending')).toMatchObject({
      next: 'pending',
      changed: false,
    });
  });

  it('refunded e charged_back ficam fora de escopo (só log)', () => {
    expect(nextOrderStatus('pending', 'refunded')).toMatchObject({
      next: 'pending',
      changed: false,
    });
    expect(nextOrderStatus('pending', 'charged_back')).toMatchObject({
      next: 'pending',
      changed: false,
    });
  });
});

describe('idempotência de estados terminais', () => {
  const terminals: OrderStatus[] = ['paid', 'rejected', 'cancelled', 'expired'];
  const events: MpPaymentStatus[] = ['approved', 'rejected', 'cancelled', 'in_process'];

  for (const state of terminals) {
    for (const event of events) {
      it(`${state} + ${event} não reabre o pedido`, () => {
        expect(nextOrderStatus(state, event)).toMatchObject({ next: state, changed: false });
      });
    }
  }
});

describe('draft ignora eventos de pagamento', () => {
  it('draft + approved não muda (cobrança ainda não criada)', () => {
    expect(nextOrderStatus('draft', 'approved')).toMatchObject({ next: 'draft', changed: false });
  });
});

describe('applyPixExpiry', () => {
  const now = 1_719_800_000_000;

  it('expira pedido pendente vencido', () => {
    expect(applyPixExpiry('pending', now - 1, now)).toMatchObject({
      next: 'expired',
      changed: true,
    });
  });

  it('expira exatamente no instante do vencimento', () => {
    expect(applyPixExpiry('pending', now, now)).toMatchObject({ next: 'expired', changed: true });
  });

  it('mantém pendente ainda válido', () => {
    expect(applyPixExpiry('pending', now + 1000, now)).toMatchObject({
      next: 'pending',
      changed: false,
    });
  });

  it('não expira pedido que não está pendente', () => {
    expect(applyPixExpiry('paid', now - 1000, now)).toMatchObject({ next: 'paid', changed: false });
  });
});
