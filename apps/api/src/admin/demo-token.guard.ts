import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guarda das rotas /admin por um demo-token NÃO-secreto (o front pré-anexa; a UI
 * rotula como "token de demonstração pública, não é credencial real"). O objetivo
 * é só evitar cliques acidentais de bot/scraper nas ações de escrita — a defesa
 * real de abuso é o rate-limit agressivo dessas rotas. Como o token não é segredo,
 * comparação simples basta (não há segredo a proteger contra timing).
 */
@Injectable()
export class DemoTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-demo-token'];
    const expected = this.config.get<string>('DEMO_TOKEN');
    if (typeof provided !== 'string' || expected === undefined || provided !== expected) {
      throw new UnauthorizedException('demo-token ausente ou inválido');
    }
    return true;
  }
}
