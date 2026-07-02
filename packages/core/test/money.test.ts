import { describe, expect, it } from 'vitest';
import { formatBRL } from '../src/money.js';

describe('formatBRL', () => {
  it('formata valor do produto da isca', () => {
    expect(formatBRL(4700)).toBe('R$ 47,00');
  });

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('preenche centavos com zero à esquerda', () => {
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(90)).toBe('R$ 0,90');
  });

  it('agrupa milhares com ponto', () => {
    expect(formatBRL(100000)).toBe('R$ 1.000,00');
    expect(formatBRL(123456789)).toBe('R$ 1.234.567,89');
  });

  it('formata valores negativos', () => {
    expect(formatBRL(-4700)).toBe('-R$ 47,00');
  });

  it('rejeita valores não inteiros', () => {
    expect(() => formatBRL(47.5)).toThrow(TypeError);
    expect(() => formatBRL(Number.NaN)).toThrow(TypeError);
  });
});
