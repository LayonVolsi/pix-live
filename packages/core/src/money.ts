/**
 * Dinheiro é sempre inteiro em centavos no domínio — nunca float.
 * A formatação para exibição vive aqui, determinística e independente de locale
 * (agrupamento de milhar manual, para não depender do ICU do runtime).
 */

/**
 * Converte reais (o que o provedor de pagamento devolve) em centavos inteiros.
 *
 * O Mercado Pago manda `transaction_amount` como float em reais. A conversão
 * ingênua mente: `19.99 * 100 === 1998.9999999999998` (IEEE-754). Num sistema
 * cuja tese é "o dinheiro não credita errado", esse é o primeiro lugar onde um
 * centavo some.
 *
 * `Math.round` resolve o ruído de ponto flutuante. O que ele NÃO deve fazer é
 * esconder um valor genuinamente ambíguo: BRL não tem terceira casa decimal, e
 * um `1.005` vindo do provedor não é ruído — é dado que a gente não sabe
 * interpretar. Arredondar em silêncio ali seria escolher um centavo no lugar do
 * provedor. **Fail-closed: lança.**
 */
export function reaisToCents(reais: number): number {
  if (typeof reais !== 'number' || !Number.isFinite(reais)) {
    throw new TypeError('valor em reais deve ser um número finito');
  }
  if (reais < 0) {
    throw new RangeError('valor em reais não pode ser negativo');
  }
  const scaled = reais * 100;
  const rounded = Math.round(scaled);
  // Tolerância só para o ruído de IEEE-754 (da ordem de 1e-10 nesta escala),
  // nunca para uma terceira casa decimal real.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError('valor em reais tem precisão sub-centavo — ambíguo, recusado');
  }
  if (!Number.isSafeInteger(rounded)) {
    throw new RangeError('valor em reais fora da faixa segura');
  }
  return rounded;
}

/** Converte centavos inteiros em reais (para enviar ao provedor). */
export function centsToReais(amountCents: number): number {
  if (!Number.isInteger(amountCents)) {
    throw new TypeError('amountCents deve ser um inteiro (centavos)');
  }
  return amountCents / 100;
}

/** Formata centavos inteiros como moeda BRL: `4700` → `"R$ 47,00"`. */
export function formatBRL(amountCents: number): string {
  if (!Number.isInteger(amountCents)) {
    throw new TypeError('amountCents deve ser um inteiro (centavos)');
  }
  const negative = amountCents < 0;
  const abs = Math.abs(amountCents);
  const reais = Math.floor(abs / 100).toString();
  const cents = (abs % 100).toString().padStart(2, '0');
  let grouped = '';
  for (let i = 0; i < reais.length; i += 1) {
    if (i > 0 && (reais.length - i) % 3 === 0) grouped += '.';
    grouped += reais.charAt(i);
  }
  return `${negative ? '-' : ''}R$ ${grouped},${cents}`;
}
