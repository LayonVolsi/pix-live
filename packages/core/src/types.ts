/**
 * Tipos de domínio compartilhados do Pix Live.
 *
 * `packages/core` é domínio PURO: nenhuma dependência de framework (NestJS,
 * Prisma, HTTP). Só a lógica que decide "o dinheiro duplica ou não".
 */

/** Veredito de processamento de um webhook, registrado na trilha de auditoria. */
export type Verdict =
  | 'processado'
  | 'ts_suspeito'
  | 'duplicata_ignorada'
  | 'assinatura_invalida'
  | 'pagamento_desconhecido'
  /**
   * O provedor confirma o pagamento, mas ele NÃO corresponde a este pedido:
   * valor diferente ou referência externa apontando para outro lugar. Não
   * credita. É ack (200), não erro — divergência é condição permanente, e um
   * 500 só provocaria tempestade de reentrega para um fato que não vai mudar.
   */
  | 'dados_divergentes'
  | 'erro';

/** Estado do pedido. `draft` só existe antes da cobrança ser criada. */
export type OrderStatus = 'draft' | 'pending' | 'paid' | 'rejected' | 'cancelled' | 'expired';

/**
 * Status que o Mercado Pago pode reportar num pagamento.
 * A máquina de estados cobre TODOS — não só o caminho feliz.
 */
export type MpPaymentStatus =
  'approved' | 'rejected' | 'cancelled' | 'in_process' | 'pending' | 'refunded' | 'charged_back';
