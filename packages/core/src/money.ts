/**
 * Dinheiro é sempre inteiro em centavos no domínio — nunca float.
 * A formatação para exibição vive aqui, determinística e independente de locale
 * (agrupamento de milhar manual, para não depender do ICU do runtime).
 */

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
