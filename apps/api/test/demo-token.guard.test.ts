import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { DemoTokenGuard } from '../src/admin/demo-token.guard.js';

function contextWith(token: string | undefined): ExecutionContext {
  const headers = token === undefined ? {} : { 'x-demo-token': token };
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guardExpecting(expected: string): DemoTokenGuard {
  return new DemoTokenGuard({ get: () => expected } as unknown as ConfigService);
}

describe('DemoTokenGuard', () => {
  it('aceita o token correto', () => {
    expect(guardExpecting('tok-123').canActivate(contextWith('tok-123'))).toBe(true);
  });

  it('rejeita token incorreto', () => {
    expect(() => guardExpecting('tok-123').canActivate(contextWith('errado'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita token ausente', () => {
    expect(() => guardExpecting('tok-123').canActivate(contextWith(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
