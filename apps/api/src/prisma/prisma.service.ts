import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
