import { describe, expect, it } from 'vitest';
import { withPoolLimits } from '../src/prisma/prisma.service.js';

const BASE = 'postgresql://user:pass@host:5432/db';

describe('withPoolLimits', () => {
  it('aplica o teto de pool quando a URL não o traz', () => {
    const url = new URL(withPoolLimits(BASE, 5, 10));
    expect(url.searchParams.get('connection_limit')).toBe('5');
    expect(url.searchParams.get('pool_timeout')).toBe('10');
  });

  it('NÃO sobrescreve o que já veio na URL', () => {
    // Um DATABASE_URL de pooler chega com connection_limit=1 de propósito (não competir
    // com o pooler externo). Se o código sobrescrevesse, o deploy quebraria de um jeito
    // que nenhum teste local pegaria — o valor certo depende do host, não do código.
    const comPooler = `${BASE}?connection_limit=1&pgbouncer=true`;
    const url = new URL(withPoolLimits(comPooler, 5, 10));
    expect(url.searchParams.get('connection_limit')).toBe('1');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
    expect(url.searchParams.get('pool_timeout')).toBe('10'); // o que faltava, preenche
  });

  it('preserva credenciais, host, porta e database', () => {
    const url = new URL(withPoolLimits(BASE, 5, 10));
    expect(url.username).toBe('user');
    expect(url.host).toBe('host:5432');
    expect(url.pathname).toBe('/db');
  });
});
