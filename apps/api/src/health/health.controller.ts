import { Controller, Get, Logger, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckError, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult, HealthIndicatorResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Healthcheck dividido em liveness e readiness — padrão que orquestradores
 * (Render, Docker, k8s) esperam. Fica FORA do prefixo `/api/v1` de propósito:
 * o probe bate em `/health/*`.
 *
 * - `/health/live`  → o processo está vivo? (não checa dependências)
 * - `/health/ready` → o Postgres responde? (gate de tráfego)
 */
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    // Liveness: se o event loop responde, o processo está vivo.
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([(): Promise<HealthIndicatorResult> => this.pingDatabase()]);
  }

  /** Readiness da dependência crítica: um `SELECT 1` no Postgres. */
  private async pingDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (error) {
      // Detalhe (host/porta/erro do driver) só no log — NUNCA na resposta pública.
      this.logger.error(
        'Readiness falhou: Postgres inacessível',
        error instanceof Error ? error.stack : String(error),
      );
      throw new HealthCheckError('Postgres indisponível', {
        database: { status: 'down' },
      });
    }
  }
}
