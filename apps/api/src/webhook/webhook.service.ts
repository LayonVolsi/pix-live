import { performance } from 'node:perf_hooks';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WebhookSource } from '@prisma/client';
import type { Order, WebhookVerdict } from '@prisma/client';
import {
  decideVerdict,
  httpStatusForVerdict,
  isTimestampWithinWindow,
  nextOrderStatus,
  remoteLookupNeeded,
  verdictResultsInCredit,
  verifySignature,
} from '@pix-live/core';
import type { MpPaymentStatus, Verdict } from '@pix-live/core';
import { OutboundBudgetService, REPLAY_LOOKUP_BUDGET } from '../payment/outbound-budget.service.js';
import { PAYMENT_PROVIDER } from '../payment/payment-provider.port.js';
import type { PaymentProvider, RemotePayment } from '../payment/payment-provider.port.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface WebhookInput {
  /** Bytes originais do corpo — só persistidos quando a assinatura é válida. */
  readonly rawBody: string;
  readonly dataId: string | null;
  readonly signatureHeader: string | null;
  readonly requestId: string | null;
  /** Origem: `mercadopago` (rota pública) ou `admin_replay` (invocação em processo). */
  readonly source?: WebhookSource;
}

export interface WebhookOutcome {
  readonly status: number;
  readonly verdict: Verdict;
}

/**
 * Orquestra as 3 camadas do webhook, mas NÃO decide — a decisão é do core
 * (`decideVerdict`). Aqui só apuramos fatos do banco/provedor e aplicamos o
 * efeito. Invariantes de segurança (contrato api-4): short-circuit antes de I/O
 * na assinatura inválida; P2002 tratado localmente como duplicata; auditoria e
 * crédito em transações separadas; valor SÓ de fonte autenticada.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly budget: OutboundBudgetService,
  ) {}

  async process(input: WebhookInput): Promise<WebhookOutcome> {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET') ?? '';

    // ── Camada 1 (autenticidade). SHORT-CIRCUIT: zero I/O se falhar.
    const sig = verifySignature({
      signatureHeader: input.signatureHeader ?? '',
      requestId: input.requestId ?? '',
      dataId: input.dataId ?? '',
      secret,
    });
    if (!sig.valid || input.dataId === null) {
      // Não persiste (anti-flood de anônimo); só loga e devolve 401 genérico.
      this.logger.warn('Webhook rejeitado na Camada 1 (assinatura inválida) — sem I/O');
      throw new UnauthorizedException('assinatura inválida');
    }

    // Sem guard de tamanho: as colunas de auditoria são TEXT (ver schema) e a
    // entrada é limitada pelo teto de header do Node + cap de corpo de 32KB.
    // Rejeitar por tamanho aqui criaria fail-closed em drift legítimo do provedor.
    return this.processAuthenticated({ ...input, dataId: input.dataId }, sig.ts);
  }

  private async processAuthenticated(
    input: WebhookInput & { dataId: string },
    ts: string | null,
  ): Promise<WebhookOutcome> {
    const startedAt = performance.now();
    const source = input.source ?? WebhookSource.mercadopago;
    const { dataId } = input;

    // ── Fatos do banco PRIMEIRO (o core decide; a rota só apura). A ordem importa:
    // eles determinam se a consulta ao provedor é sequer necessária (ver abaixo).
    const order = await this.prisma.order.findUnique({ where: { mpPaymentId: dataId } });
    // Dedupe da Camada 2 por request-id. Se o header vier ausente (atípico do MP),
    // o dedupe não se aplica — mas o dinheiro CONTINUA protegido pela Camada 3
    // (creditAlreadyExists + unique em OrderCredit.mpPaymentId). NÃO usamos um
    // sentinela compartilhado (ex.: '') para requestId nulo: isso colidiria
    // pagamentos DIFERENTES sem request-id entre si — pior que o gap. (Review, finding 2.)
    const requestIdAlreadyProcessed =
      input.requestId !== null &&
      (await this.prisma.webhookEvent.findFirst({
        where: { source, requestIdHeader: input.requestId },
      })) !== null;
    const creditAlreadyExists =
      (await this.prisma.orderCredit.findUnique({ where: { mpPaymentId: dataId } })) !== null;
    const tsWithinWindow = ts !== null && isTimestampWithinWindow(Number(ts), Date.now());

    // ── Consulta AUTENTICADA ao provedor (status/valor confiáveis, nunca o corpo),
    // feita SÓ quando muda o veredito — `remoteLookupNeeded` é a invariante que
    // prova isso contra a ordem de `decideVerdict` (teste exaustivo no core).
    // Com o provedor real, cada consulta é uma chamada autenticada de saída: o
    // replay de um pedido já creditado (o caminho do wow, acionável por qualquer
    // visitante) passa a custar ZERO chamada externa.
    let remote: RemotePayment | null = null;
    if (
      remoteLookupNeeded({
        signatureValid: true,
        requestIdAlreadyProcessed,
        creditAlreadyExists,
        tsWithinWindow,
      })
    ) {
      // O webhook GENUÍNO do MP nunca é orçado (é o caminho do dinheiro, e já vem
      // limitado a montante: o MP só notifica sobre cobranças que nós criamos).
      // O REPLAY é outra história: é acionável por qualquer visitante (o demo-token
      // é público por design) e, quando o evento não tem crédito — pagamento
      // rejeitado, por exemplo —, chega até aqui e consulta o provedor de verdade.
      if (
        source === WebhookSource.admin_replay &&
        this.isRealProvider() &&
        !this.budget.consume('replay_lookup', REPLAY_LOOKUP_BUDGET)
      ) {
        throw new HttpException(
          'limite de consultas ao provedor atingido — tente em instantes',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      try {
        remote = await this.provider.getPayment(dataId);
      } catch (error) {
        // Erro transitório de rede/infra ≠ "não existe": devolve 500 para o MP
        // reentregar. NÃO persiste evento aqui — uma linha `erro` chaveada por
        // request-id envenenaria o dedupe (a reentrega cairia em duplicata_ignorada
        // e o pagamento aprovado nunca seria creditado). Ver review, finding 1 (ALTO).
        this.logger.error(
          'getPayment falhou (rede/infra) — 500 para reentrega, sem persistir evento',
          error instanceof Error ? error.stack : String(error),
        );
        throw new InternalServerErrorException();
      }
    }

    let verdict: Verdict = decideVerdict({
      signatureValid: true,
      requestIdAlreadyProcessed,
      orderKnown: order !== null && remote !== null,
      creditAlreadyExists,
      tsWithinWindow,
    });

    // ── O pagamento que o provedor confirmou é REALMENTE deste pedido?
    // Até aqui, "aprovado" era palavra do provedor sobre um id — ninguém conferia
    // se o VALOR e a REFERÊNCIA batem com o pedido que vamos creditar. Com o mock
    // isso era trivialmente verdade (quem criava a cobrança respondia a consulta);
    // com o provedor real, esta é a primeira fonte de valor independente. Sem a
    // conferência, um pagamento de R$ 1 confirmado creditaria um pedido de R$ 47.
    if (verdictResultsInCredit(verdict) && order !== null && remote !== null) {
      const mismatch = this.paymentMismatch(order, remote);
      if (mismatch !== null) {
        this.logger.error(`pagamento não corresponde ao pedido (${mismatch}) — crédito recusado`);
        verdict = 'dados_divergentes';
      }
    }

    // ── Camada 3: crédito idempotente (só quando o veredito credita E há pedido/pagamento).
    if (verdictResultsInCredit(verdict) && order !== null && remote !== null) {
      const applied = await this.applyPayment(order, dataId, remote.status);
      if (applied === 'duplicate') verdict = 'duplicata_ignorada';
    }

    // ── Auditoria em statement SEPARADO da transação de crédito (sobrevive ao P2002).
    await this.recordEvent(input, source, dataId, ts, verdict, order?.id ?? null, startedAt);
    return { status: httpStatusForVerdict(verdict), verdict };
  }

  /** O orçamento de saída só faz sentido quando a chamada custa algo a alguém. */
  private isRealProvider(): boolean {
    return this.config.get<string>('PAYMENT_PROVIDER') === 'mercadopago';
  }

  /**
   * O pagamento confirmado pelo provedor corresponde a ESTE pedido?
   *
   * Devolve o motivo da divergência (para o log) ou `null` quando confere.
   * Fail-closed por construção: qualquer discordância recusa o crédito.
   *
   * `externalReference` vazio é tratado como divergência quando o provedor
   * deveria tê-la preenchido — nós SEMPRE a enviamos na criação da cobrança
   * (`external_reference: orderId`), então ausência é sinal de que este pagamento
   * não nasceu deste fluxo.
   */
  private paymentMismatch(order: Order, remote: RemotePayment): string | null {
    if (remote.amountCents !== order.amountCents) {
      // Nunca loga o valor absoluto junto do id do pedido — só o fato.
      return 'valor divergente';
    }
    if (remote.externalReference !== order.id) {
      return 'referência externa divergente';
    }
    return null;
  }

  /**
   * Aplica o pagamento. Só credita quando a transição leva a `paid` (aprovado);
   * rejeitado/cancelado só muda o status do pedido. O crédito é uma transação
   * cujo insert em `OrderCredit` (unique em mp_payment_id) resolve a corrida no
   * BANCO: a 2ª entrega concorrente pega P2002 → 'duplicate'.
   */
  private async applyPayment(
    order: Order,
    mpPaymentId: string,
    mpStatus: MpPaymentStatus,
  ): Promise<'credited' | 'duplicate' | 'no_credit'> {
    const transition = nextOrderStatus(order.status, mpStatus);
    if (transition.next === 'paid') {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.orderCredit.create({
            data: { orderId: order.id, mpPaymentId, amountCents: order.amountCents },
          });
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'paid', paidAt: new Date() },
          });
        });
        return 'credited';
      } catch (error) {
        if (this.isUniqueViolation(error)) return 'duplicate';
        throw error;
      }
    }
    if (transition.changed) {
      // Optimistic lock: só altera se o status ainda for o que lemos. Não clobbera
      // um 'paid' já commitado por uma entrega concorrente do mesmo pagamento
      // (lost update / TOCTOU no campo Order.status do painel). Ver review.
      await this.prisma.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: transition.next },
      });
    }
    return 'no_credit';
  }

  private async recordEvent(
    input: WebhookInput,
    source: WebhookSource,
    mpPaymentId: string,
    ts: string | null,
    verdict: WebhookVerdict,
    relatedOrderId: string | null,
    startedAt: number,
  ): Promise<void> {
    const processingMs = Math.round(performance.now() - startedAt);
    try {
      await this.prisma.webhookEvent.create({
        data: {
          source,
          signatureHeader: input.signatureHeader,
          requestIdHeader: input.requestId,
          tsFromSignature: ts,
          signatureValid: true, // só eventos com assinatura válida chegam aqui
          verdict,
          mpPaymentId,
          relatedOrderId,
          processingMs,
          rawBody: input.rawBody, // persistido só para assinatura válida (anti-flood)
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // Reentrega EXATA (mesmo source+request-id) já auditada — idempotente.
        this.logger.debug('WebhookEvent já auditado (reentrega exata) — ignorado');
        return;
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
