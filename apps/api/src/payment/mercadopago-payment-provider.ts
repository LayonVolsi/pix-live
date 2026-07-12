import { Logger } from '@nestjs/common';
import { centsToReais, reaisToCents } from '@pix-live/core';
import type { MpPaymentStatus } from '@pix-live/core';
import { z } from 'zod';
import type {
  CreatePixChargeInput,
  PaymentProvider,
  PixCharge,
  RemotePayment,
} from './payment-provider.port.js';

/**
 * Host do Mercado Pago: `const` de módulo, JAMAIS de env/config/input.
 *
 * Um host configurável seria o vetor de SSRF clássico deste tipo de adapter — e
 * é exatamente a superfície que um SDK de terceiro costuma expor "por
 * conveniência" (base-url por região). Aqui não existe caminho de código que
 * mande esta requisição para outro lugar.
 */
const MP_API_BASE_URL = 'https://api.mercadopago.com';

/** Timeout curto: o webhook do MP tem paciência limitada e nós também. */
const REQUEST_TIMEOUT_MS = 8_000;

/** Teto de bytes da resposta — o host é fixo, mas resposta é entrada. */
const MAX_RESPONSE_BYTES = 256 * 1024;

/** Ids de pagamento do MP são numéricos. Nada além disso entra numa URL. */
const PAYMENT_ID_PATTERN = /^[0-9]{1,32}$/;

/**
 * Erro do provedor que NUNCA carrega o corpo da resposta.
 *
 * Por que isso importa: o `ProblemDetailsFilter` ecoa `message` verbatim para
 * status < 500. Se um erro do MP virasse `BadRequestException(corpoDoMp)`, o
 * corpo cru de um terceiro apareceria na resposta pública do `POST /orders`.
 * Esta classe é um `Error` simples — cai no branch genérico do filtro (500,
 * "Erro interno.") — e carrega só metadados seguros para o log.
 */
export class PaymentProviderError extends Error {
  constructor(
    readonly reason: 'http' | 'invalid_response' | 'timeout' | 'network' | 'redirect',
    readonly httpStatus?: number,
  ) {
    super(`falha no provedor de pagamento (${reason}${httpStatus ? ` ${httpStatus}` : ''})`);
    this.name = 'PaymentProviderError';
  }
}

/**
 * Resposta do MP validada em RUNTIME, nunca por cast.
 *
 * O provedor é "semi-confiável" pelo próprio threat model: um `as PixCharge`
 * gravaria `undefined` no banco calado se o formato mudasse. Zod é a mesma
 * ferramenta que já valida o env — falha de schema vira `invalid_response`.
 */
const MpPaymentSchema = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.string(),
  external_reference: z.string().nullable().optional(),
  transaction_amount: z.number(),
  date_of_expiration: z.string().nullable().optional(),
  point_of_interaction: z
    .object({
      transaction_data: z.object({
        qr_code: z.string(),
        qr_code_base64: z.string(),
      }),
    })
    .optional(),
});

type MpPayment = z.infer<typeof MpPaymentSchema>;

/**
 * Mapeia o status do MP para o union fechado do domínio.
 *
 * NUNCA um cast: `MpPaymentStatus` alimenta uma máquina de estados com
 * `assertNever` que LANÇA em valor desconhecido. O MP tem status que o union não
 * cobre (`authorized`, `in_mediation`) — um cast cego derrubaria o processamento
 * do webhook em pleno voo. Desconhecido cai em `pending`: não credita, não
 * transiciona, não quebra. Fail-closed com log.
 */
export function mapMpStatus(raw: string, logger?: Logger): MpPaymentStatus {
  switch (raw) {
    case 'approved':
    case 'pending':
    case 'in_process':
    case 'rejected':
    case 'cancelled':
    case 'refunded':
    case 'charged_back':
      return raw;
    default:
      // Status novo/desconhecido do provedor: trata como pendente (não credita).
      logger?.warn(`status desconhecido do provedor tratado como pending: ${raw}`);
      return 'pending';
  }
}

/**
 * Adapter do Mercado Pago (sandbox) via `fetch` nativo endurecido.
 *
 * Sem SDK de propósito (ver adr/0006): o escopo real são DOIS endpoints REST, e
 * as travas que os laudos exigiram — host fixo, `redirect: 'error'`, timeout,
 * teto de bytes, Zod na resposta, erro sem corpo — são precisamente o que um SDK
 * genérico esconde atrás da própria configuração.
 */
export class MercadoPagoPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MercadoPagoPaymentProvider.name);

  constructor(
    private readonly accessToken: string,
    /** Injetável para testar offline — a suíte NUNCA chama o MP de verdade. */
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);

    const payment = await this.request('/v1/payments', {
      method: 'POST',
      // Idempotência de SAÍDA: o mesmo pedido nunca vira duas cobranças, mesmo
      // que a rede engasgue e a gente reenvie. A chave é o id do pedido.
      idempotencyKey: input.orderId,
      body: {
        transaction_amount: centsToReais(input.amountCents),
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.orderId,
        date_of_expiration: expiresAt.toISOString(),
        payer: { email: input.payerEmail ?? 'test_user@testuser.com' },
      },
    });

    const qr = payment.point_of_interaction?.transaction_data;
    if (qr === undefined) {
      // 200 sem QR é resposta malformada para o nosso caso de uso: não dá para
      // exibir cobrança nenhuma. Melhor quebrar alto que gravar string vazia.
      throw new PaymentProviderError('invalid_response');
    }

    return {
      providerPaymentId: String(payment.id),
      qrEmv: qr.qr_code,
      // O contrato da porta exige base64 puro; o MP às vezes manda com prefixo.
      qrPngBase64: qr.qr_code_base64.replace(/^data:image\/[a-z]+;base64,/, ''),
      expiresAt: this.parseExpiry(payment.date_of_expiration, expiresAt),
    };
  }

  async getPayment(providerPaymentId: string): Promise<RemotePayment | null> {
    // Shape-check ANTES de tocar a rede: um id fora do formato não vira path.
    // (O HMAC autentica o manifesto, não garante que o id seja um id do MP.)
    if (!PAYMENT_ID_PATTERN.test(providerPaymentId)) {
      this.logger.warn('data.id fora do formato do provedor — tratado como desconhecido');
      return null;
    }

    const payment = await this.request(`/v1/payments/${providerPaymentId}`, {
      method: 'GET',
      notFoundIsNull: true,
    });
    if (payment === null) return null;

    return {
      status: mapMpStatus(payment.status, this.logger),
      externalReference: payment.external_reference ?? '',
      amountCents: reaisToCents(payment.transaction_amount),
    };
  }

  /** Overloads: só o GET pode devolver `null` (404 = confirmação de inexistência). */
  private async request(
    path: string,
    opts: { method: 'POST'; body: unknown; idempotencyKey: string },
  ): Promise<MpPayment>;
  private async request(
    path: string,
    opts: { method: 'GET'; notFoundIsNull: true },
  ): Promise<MpPayment | null>;
  private async request(
    path: string,
    opts: {
      method: 'GET' | 'POST';
      body?: unknown;
      idempotencyKey?: string;
      notFoundIsNull?: boolean;
    },
  ): Promise<MpPayment | null> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    if (opts.idempotencyKey !== undefined) headers['X-Idempotency-Key'] = opts.idempotencyKey;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await this.fetchImpl(`${MP_API_BASE_URL}${path}`, {
        method: opts.method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        // Um 3xx REJEITA em vez de seguir: nenhum redirect nos leva a outro host.
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // NUNCA propaga o erro cru (clients HTTP embutem headers — inclusive o
      // Authorization — no objeto de erro). Só a razão, já classificada.
      throw new PaymentProviderError(this.classify(error));
    }

    // A distinção que decide se o dinheiro credita: 404 é o provedor CONFIRMANDO
    // que o pagamento não existe (→ pagamento_desconhecido, ack 200). Qualquer
    // outro erro é ambíguo (401/403/429/5xx/rede) e precisa LANÇAR → 500 → o MP
    // reentrega. Coagir ambiguidade para "não existe" faria o MP parar de
    // reentregar um pagamento aprovado — a perda de crédito por um caminho novo.
    if (res.status === 404 && opts.notFoundIsNull === true) return null;
    if (!res.ok) {
      this.logger.error(`provedor respondeu ${res.status} em ${opts.method} ${path}`);
      throw new PaymentProviderError('http', res.status);
    }

    const text = await this.readCapped(res);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new PaymentProviderError('invalid_response');
    }

    const parsed = MpPaymentSchema.safeParse(json);
    if (!parsed.success) {
      // Loga que o formato mudou — mas nunca o corpo (tem PII do pagador).
      this.logger.error('resposta do provedor não bate com o schema esperado');
      throw new PaymentProviderError('invalid_response');
    }
    return parsed.data;
  }

  /** Lê o corpo contando bytes: `content-length` é dica, não garantia. */
  private async readCapped(res: Response): Promise<string> {
    const declared = Number(res.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      throw new PaymentProviderError('invalid_response');
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new PaymentProviderError('invalid_response');
    }
    return new TextDecoder().decode(buffer);
  }

  private classify(error: unknown): 'timeout' | 'redirect' | 'network' {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
      if (error.message.toLowerCase().includes('redirect')) return 'redirect';
    }
    return 'network';
  }

  /** Usa o vencimento que o provedor devolveu; só cai no nosso se vier inválido. */
  private parseExpiry(raw: string | null | undefined, fallback: Date): Date {
    if (typeof raw !== 'string') return fallback;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }
}
