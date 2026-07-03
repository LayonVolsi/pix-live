/**
 * Espelho manual do contrato da API (OrderView/PanelView/rotas admin).
 * Duplicação consciente e pequena — codegen/OpenAPI é overkill pro escopo (B8).
 * Verificado contra apps/api/src/{orders,reconciliation,admin} em 2026-07-03.
 */

export interface OrderView {
  readonly publicRef: string;
  readonly productName: string;
  readonly amountCents: number;
  readonly amountFormatted: string;
  readonly status: string;
  readonly qrEmv: string | null;
  readonly qrPngBase64: string | null;
  readonly pixExpiresAt: string | null;
}

export interface PanelOrder {
  readonly publicRef: string;
  readonly productName: string;
  readonly amountFormatted: string;
  readonly status: string;
  readonly payerEmailMasked: string | null;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly processedCount: number;
  readonly blockedCount: number;
}

export interface PanelEvent {
  readonly id: string;
  readonly receivedAt: string;
  readonly source: string;
  readonly verdict: string;
  readonly signatureValid: boolean;
  readonly mpPaymentId: string | null;
  readonly orderPublicRef: string | null;
  readonly processingMs: number;
}

export interface PanelView {
  readonly orders: readonly PanelOrder[];
  readonly events: readonly PanelEvent[];
}

export interface AdminActionResult {
  readonly verdict: string;
}
