import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * Constrói a URL de conexão com o teto de pool explícito.
 *
 * Sem `connection_limit`, o Prisma dimensiona o pool por `num_cpus × 2 + 1` lido do
 * CONTAINER — um número que nada tem a ver com o teto de conexões do Postgres gerenciado.
 * Num plano de entrada (teto baixo), a app sozinha esgota o banco sob carga modesta.
 *
 * Parâmetros já presentes na URL são respeitados (o operador do deploy manda): só
 * preenchemos o que falta. Assim um `DATABASE_URL` vindo pronto de um pooler continua
 * válido sem que o código o sobrescreva por trás.
 */
export function withPoolLimits(url: string, connectionLimit: number, poolTimeout: number): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', String(connectionLimit));
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', String(poolTimeout));
  }
  return parsed.toString();
}

/**
 * Cliente Prisma como provider injetável.
 *
 * Conexão PREGUIÇOSA de propósito: não chamamos `$connect()` no boot, então o
 * processo sobe mesmo com o banco momentaneamente indisponível — quem reporta a
 * saúde real da conexão é o `/health/ready`. Isso deixa o liveness independente
 * do banco (o orquestrador não mata o container por um blip de rede no Postgres).
 *
 * O `$disconnect()` no shutdown fecha o pool limpo quando o SIGTERM chega
 * (via `enableShutdownHooks`).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    // O env já foi validado pelo Zod no boot (fail-fast) — se chegou aqui, existe.
    const url = config.get<string>('DATABASE_URL') ?? '';
    const connectionLimit = config.get<number>('DATABASE_CONNECTION_LIMIT') ?? 5;
    const poolTimeout = config.get<number>('DATABASE_POOL_TIMEOUT') ?? 10;

    super({ datasources: { db: { url: withPoolLimits(url, connectionLimit, poolTimeout) } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
