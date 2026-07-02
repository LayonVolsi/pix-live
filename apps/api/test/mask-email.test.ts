import { describe, expect, it } from 'vitest';
import { maskEmail } from '../src/common/mask-email.js';

describe('maskEmail', () => {
  it('mantém 2 primeiras letras e o domínio', () => {
    expect(maskEmail('joana@teste.com')).toBe('jo***@teste.com');
  });

  it('sempre esconde ao menos 1 caractere', () => {
    expect(maskEmail('ab@x.com')).toBe('ab*@x.com');
  });

  it('null permanece null', () => {
    expect(maskEmail(null)).toBeNull();
  });

  it('sem @ vira ***', () => {
    expect(maskEmail('semarroba')).toBe('***');
  });
});
