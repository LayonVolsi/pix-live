import type { PassoTrilha } from './trechos.gerados';

/**
 * A frase de cada passo, para quem não lê código. `Record<PassoTrilha, …>` é exaustivo:
 * passo novo no servidor sem frase aqui quebra o typecheck — a tela nunca mostra um passo
 * mudo. O trecho de código de cada passo vem de `trechos.gerados.ts`, extraído do servidor.
 */
export const FRASES: Record<PassoTrilha, string> = {
  assinatura_conferida: 'Conferi se o aviso veio mesmo do Mercado Pago: a assinatura bate.',
  pedido_localizado: 'Achei o pedido a que este pagamento pertence.',
  pedido_nao_localizado: 'Não achei nenhum pedido para este pagamento.',
  aviso_repetido: 'Este mesmo aviso já tinha chegado antes.',
  credito_ja_existe: 'Este pagamento já foi creditado antes.',
  provedor_consultado: 'Perguntei ao Mercado Pago quanto foi pago de verdade.',
  provedor_nao_consultado:
    'Nem precisei perguntar ao Mercado Pago: a resposta já estava no meu registro.',
  valor_confere: 'O valor pago confere com o valor do pedido.',
  valor_divergente: 'O valor pago não confere com o pedido: recusei o crédito.',
  horario_suspeito: 'O aviso chegou com horário fora da janela esperada: marquei como suspeito.',
  credito_registrado: 'Creditei o pedido, uma única vez.',
  credito_bloqueado_pelo_banco: 'Tentei creditar, e o próprio banco de dados recusou a duplicata.',
  nao_creditei_de_novo: 'Não creditei de novo. O dinheiro não aparece em dobro.',
  sem_credito: 'Nenhum crédito foi feito com este aviso.',
  auditoria_gravada: 'Anotei tudo na trilha de auditoria.',
};

/** Passos que decidem o desfecho — ganham destaque na tela. */
export const DESFECHOS: ReadonlySet<PassoTrilha> = new Set<PassoTrilha>([
  'credito_registrado',
  'credito_bloqueado_pelo_banco',
  'nao_creditei_de_novo',
  'valor_divergente',
]);
