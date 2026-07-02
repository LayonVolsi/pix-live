/**
 * Porta (interface) do provedor de pagamento Pix.
 *
 * O domínio da API fala com ESTA abstração, nunca com o SDK do Mercado Pago
 * direto. Duas implementações plugáveis por trás dela: `mock` (offline, CI e
 * `docker compose up` sem conta no MP) e `mercadopago` (sandbox real — fase 4).
 * Trocar de provedor é trocar o binding do token, nada mais.
 */

/** Token de injeção do provedor (interfaces somem no runtime; DI precisa de um token). */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Entrada para criar uma cobrança Pix. Valores em centavos, nunca float. */
export interface CreatePixChargeInput {
  /** Id do pedido — vira a chave de idempotência de SAÍDA no provedor. */
  readonly orderId: string;
  readonly amountCents: number;
  readonly description: string;
  readonly payerEmail?: string;
  /** Validade da cobrança, em segundos, a partir de agora. */
  readonly expiresInSeconds: number;
}

/** Resultado da criação: o que o provedor devolve para exibir e conciliar. */
export interface PixCharge {
  /** Id do pagamento no provedor (`mp_payment_id` na conciliação). */
  readonly providerPaymentId: string;
  /** Copia-e-cola EMV (payload Pix). */
  readonly qrEmv: string;
  /** QR Code renderizado como PNG em base64 (sem `data:` prefix). */
  readonly qrPngBase64: string;
  /** Quando a cobrança expira. */
  readonly expiresAt: Date;
}

/** Contrato que todo provedor de pagamento (mock ou real) implementa. */
export interface PaymentProvider {
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>;
}
