import { describe, expect, it, vi } from 'vitest';
import {
  MercadoPagoPaymentProvider,
  PaymentProviderError,
  mapMpStatus,
} from '../src/payment/mercadopago-payment-provider.js';

/**
 * Adapter do provedor real, exercitado 100% OFFLINE (o `fetch` é injetado). A
 * suíte NUNCA chama o Mercado Pago — o que ela prova é como o adapter se comporta
 * quando o provedor mente, engasga, muda de formato ou some.
 */

const TOKEN = 'TEST-token-de-teste';
const PAYMENT_OK = {
  id: 123456789,
  status: 'approved',
  external_reference: 'order-uuid-1',
  transaction_amount: 19.99,
  date_of_expiration: '2026-08-01T10:00:00.000-03:00',
  point_of_interaction: {
    transaction_data: { qr_code: 'EMV-COPIA-E-COLA', qr_code_base64: 'aGVsbG8=' },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function providerWith(fetchImpl: typeof fetch): MercadoPagoPaymentProvider {
  return new MercadoPagoPaymentProvider(TOKEN, fetchImpl);
}

describe('MercadoPagoPaymentProvider — createPixCharge', () => {
  it('cria a cobrança e converte o valor sem perder centavo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYMENT_OK));
    const charge = await providerWith(fetchMock).createPixCharge({
      orderId: 'order-uuid-1',
      amountCents: 1999,
      description: 'Kit',
      expiresInSeconds: 900,
    });

    expect(charge.providerPaymentId).toBe('123456789');
    expect(charge.qrEmv).toBe('EMV-COPIA-E-COLA');
    expect(charge.qrPngBase64).toBe('aGVsbG8=');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Host FIXO — nunca de env/config/input.
    expect(url).toBe('https://api.mercadopago.com/v1/payments');
    // Idempotência de SAÍDA: o mesmo pedido nunca vira duas cobranças.
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Idempotency-Key']).toBe('order-uuid-1');
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    // Redirect nunca é seguido: 3xx rejeita, não navega para outro host.
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Centavos viram reais na saída, sem float sujo.
    expect(JSON.parse(init.body as string)).toMatchObject({
      transaction_amount: 19.99,
      payment_method_id: 'pix',
      external_reference: 'order-uuid-1',
    });
  });

  it('remove o prefixo data: do base64 (o contrato da porta exige base64 puro)', async () => {
    const comPrefixo = {
      ...PAYMENT_OK,
      point_of_interaction: {
        transaction_data: {
          qr_code: 'EMV',
          qr_code_base64: 'data:image/png;base64,aGVsbG8=',
        },
      },
    };
    const provider = providerWith(vi.fn().mockResolvedValue(jsonResponse(comPrefixo)) as never);

    const charge = await provider.createPixCharge({
      orderId: 'o1',
      amountCents: 100,
      description: 'x',
      expiresInSeconds: 900,
    });
    expect(charge.qrPngBase64).toBe('aGVsbG8=');
  });

  it('200 sem QR é resposta malformada — quebra alto em vez de gravar vazio', async () => {
    const semQr = { ...PAYMENT_OK, point_of_interaction: undefined };
    const provider = providerWith(vi.fn().mockResolvedValue(jsonResponse(semQr)) as never);

    await expect(
      provider.createPixCharge({
        orderId: 'o1',
        amountCents: 100,
        description: 'x',
        expiresInSeconds: 900,
      }),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe('MercadoPagoPaymentProvider — getPayment (a linha onde o dinheiro se perde)', () => {
  it('404 é o provedor CONFIRMANDO inexistência → null (ack, sem reentrega)', async () => {
    const provider = providerWith(
      vi.fn().mockResolvedValue(new Response('', { status: 404 })) as never,
    );
    await expect(provider.getPayment('123')).resolves.toBeNull();
  });

  it.each([401, 403, 429, 500, 502, 503])(
    'HTTP %i é AMBÍGUO → lança (500 → o MP reentrega; nunca "não existe")',
    async (status) => {
      // Um 401 (token errado) tratado como "não existe" faria o MP parar de
      // reentregar um pagamento aprovado: perda de crédito por um caminho novo.
      const provider = providerWith(
        vi.fn().mockResolvedValue(new Response('erro', { status })) as never,
      );
      await expect(provider.getPayment('123')).rejects.toBeInstanceOf(PaymentProviderError);
    },
  );

  it('timeout lança (não vira "não existe")', async () => {
    const timeout = Object.assign(new Error('abort'), { name: 'TimeoutError' });
    const provider = providerWith(vi.fn().mockRejectedValue(timeout) as never);

    await expect(provider.getPayment('123')).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('erro de rede lança', async () => {
    const provider = providerWith(
      vi.fn().mockRejectedValue(new TypeError('fetch failed')) as never,
    );
    await expect(provider.getPayment('123')).rejects.toMatchObject({ reason: 'network' });
  });

  it('JSON inválido lança (não credita com lixo)', async () => {
    const provider = providerWith(vi.fn().mockResolvedValue(new Response('<html>')) as never);
    await expect(provider.getPayment('123')).rejects.toMatchObject({ reason: 'invalid_response' });
  });

  it('resposta fora do schema lança (o provedor é semi-confiável, não confiável)', async () => {
    const provider = providerWith(
      vi.fn().mockResolvedValue(jsonResponse({ id: 1, status: 'approved' })) as never,
    );
    await expect(provider.getPayment('123')).rejects.toMatchObject({ reason: 'invalid_response' });
  });

  it('corpo gigante lança (resposta é entrada, mesmo de host fixo)', async () => {
    const gigante = new Response('x'.repeat(300 * 1024), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const provider = providerWith(vi.fn().mockResolvedValue(gigante) as never);
    await expect(provider.getPayment('123')).rejects.toMatchObject({ reason: 'invalid_response' });
  });

  it('id fora do formato numérico NÃO vira URL — nem toca a rede', async () => {
    // O HMAC autentica o manifesto, não garante que o id seja um id do MP.
    const fetchMock = vi.fn();
    const provider = providerWith(fetchMock);

    await expect(provider.getPayment('../../v1/users/me')).resolves.toBeNull();
    await expect(provider.getPayment('mock-pay-seed-0001')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('converte o valor do provedor em centavos exatos', async () => {
    const provider = providerWith(vi.fn().mockResolvedValue(jsonResponse(PAYMENT_OK)) as never);
    const remote = await provider.getPayment('123456789');

    // 19.99 * 100 === 1998.9999999999998 na aritmética crua.
    expect(remote?.amountCents).toBe(1999);
    expect(remote?.status).toBe('approved');
    expect(remote?.externalReference).toBe('order-uuid-1');
  });

  it('valor sub-centavo do provedor vira invalid_response, NÃO erro de rede', async () => {
    // Diagnóstico importa: se subisse como erro de rede, o webhook registraria
    // 'rede/infra' e o MP reentregaria PARA SEMPRE um fato determinístico — com o
    // log apontando para a causa errada.
    const ambiguo = { ...PAYMENT_OK, transaction_amount: 10.001 };
    const provider = providerWith(vi.fn().mockResolvedValue(jsonResponse(ambiguo)) as never);

    await expect(provider.getPayment('123')).rejects.toMatchObject({ reason: 'invalid_response' });
  });

  it('o erro NUNCA carrega o corpo da resposta do provedor', async () => {
    const corpoSensivel = JSON.stringify({ message: 'segredo-do-mp', payer_email: 'a@b.com' });
    const provider = providerWith(
      vi.fn().mockResolvedValue(new Response(corpoSensivel, { status: 400 })) as never,
    );

    try {
      await provider.getPayment('123');
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      const serializado = JSON.stringify(error) + String(error);
      expect(serializado).not.toContain('segredo-do-mp');
      expect(serializado).not.toContain('a@b.com');
      expect(error).toBeInstanceOf(PaymentProviderError);
      // Só metadado seguro sobrevive.
      expect((error as PaymentProviderError).httpStatus).toBe(400);
    }
  });
});

describe('mapMpStatus', () => {
  it('mapeia os status conhecidos do domínio', () => {
    expect(mapMpStatus('approved')).toBe('approved');
    expect(mapMpStatus('rejected')).toBe('rejected');
    expect(mapMpStatus('charged_back')).toBe('charged_back');
  });

  it('status que o MP tem e o domínio não vira pending — não crasha, não credita', () => {
    // `authorized`/`in_mediation` existem no MP e não estão no union: um cast
    // cego derrubaria a máquina de estados (assertNever LANÇA) no meio do
    // processamento do webhook.
    expect(mapMpStatus('authorized')).toBe('pending');
    expect(mapMpStatus('in_mediation')).toBe('pending');
    expect(mapMpStatus('status_que_nao_existe_ainda')).toBe('pending');
  });
});
