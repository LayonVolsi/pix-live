import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { MpPaymentStatus } from '@pix-live/core';
import QRCode from 'qrcode';
import type {
  CreatePixChargeInput,
  PaymentProvider,
  PixCharge,
  RemotePayment,
} from './payment-provider.port.js';

/** Relógio injetável — mantém `createPixCharge` testável (expiração determinística). */
export type Clock = () => Date;
/** Gerador de id injetável — mesma razão: teste determinístico. */
export type IdGenerator = () => string;

interface MockCharge {
  readonly orderId: string;
  readonly amountCents: number;
  status: MpPaymentStatus;
}

/**
 * Provedor de pagamento MOCK: roda 100% offline (CI, `docker compose up`) sem
 * conta no Mercado Pago. Renderiza um QR PNG real a partir do payload — o QR
 * "aparece" na demo — mas o payload é sintético e NÃO é uma cobrança pagável
 * (o provedor real, fase 4, devolve o EMV verdadeiro do sandbox).
 *
 * É stateful de propósito (guarda as cobranças em memória) para o fluxo offline:
 * a rota admin "simular confirmação" chama `settle()` e o `getPayment` seguinte
 * reflete o novo status — como o provedor real refletiria. Estado some no
 * restart; o seed recria o necessário.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly charges = new Map<string, MockCharge>();

  constructor(
    private readonly now: Clock = () => new Date(),
    private readonly newId: IdGenerator = () => `mock-pay-${randomUUID()}`,
  ) {}

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const providerPaymentId = this.newId();
    const qrEmv = this.buildMockPayload(input, providerPaymentId);
    const qrPngBase64 = (await QRCode.toBuffer(qrEmv, { type: 'png', margin: 1 })).toString(
      'base64',
    );
    const expiresAt = new Date(this.now().getTime() + input.expiresInSeconds * 1000);
    this.charges.set(providerPaymentId, {
      orderId: input.orderId,
      amountCents: input.amountCents,
      status: 'pending',
    });
    return { providerPaymentId, qrEmv, qrPngBase64, expiresAt };
  }

  getPayment(providerPaymentId: string): Promise<RemotePayment | null> {
    const charge = this.charges.get(providerPaymentId);
    if (charge === undefined) return Promise.resolve(null);
    return Promise.resolve({
      status: charge.status,
      externalReference: charge.orderId,
      amountCents: charge.amountCents,
    });
  }

  /** Usado pela rota admin "simular confirmação": muda o status da cobrança mock. */
  settle(providerPaymentId: string, status: MpPaymentStatus): boolean {
    const charge = this.charges.get(providerPaymentId);
    if (charge === undefined) return false;
    charge.status = status;
    return true;
  }

  /**
   * Payload SINTÉTICO do mock. Prefixado `MOCK-PIX` de propósito — não finge ser
   * um EMV Pix válido (fingir TLV errado seria pior que ser honesto). Carrega os
   * dados que a UI/conciliação precisam para o fluxo offline.
   */
  private buildMockPayload(input: CreatePixChargeInput, paymentId: string): string {
    const amount = (input.amountCents / 100).toFixed(2);
    return `MOCK-PIX|v1|pay=${paymentId}|order=${input.orderId}|amount=BRL${amount}|br`;
  }
}
