import { describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '../src/payment/mock-payment-provider.js';

describe('MockPaymentProvider', () => {
  const fixedNow = new Date('2026-07-02T12:00:00.000Z');
  const provider = new MockPaymentProvider(
    () => fixedNow,
    () => 'mock-pay-fixo',
  );

  it('expira relativo ao clock injetado (determinístico)', async () => {
    const charge = await provider.createPixCharge({
      orderId: 'ord-1',
      amountCents: 4700,
      description: 'Kit Caderno Artesanal',
      expiresInSeconds: 900,
    });
    expect(charge.providerPaymentId).toBe('mock-pay-fixo');
    expect(charge.expiresAt.toISOString()).toBe('2026-07-02T12:15:00.000Z');
  });

  it('payload carrega valor e pedido; PNG é base64 de PNG válido', async () => {
    const charge = await provider.createPixCharge({
      orderId: 'ord-42',
      amountCents: 4700,
      description: 'Kit Caderno Artesanal',
      expiresInSeconds: 900,
    });
    expect(charge.qrEmv).toContain('order=ord-42');
    expect(charge.qrEmv).toContain('BRL47.00');
    // Assinatura base64 do magic PNG (\x89PNG\r\n) começa por "iVBORw0KGgo".
    expect(charge.qrPngBase64.startsWith('iVBORw0KGgo')).toBe(true);
  });
});
