import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';

/**
 * Healthcheck dividido em liveness e readiness — padrão que orquestradores
 * (Render, Docker, k8s) esperam. Fica FORA do prefixo `/api/v1` de propósito:
 * o probe bate em `/health/*`.
 *
 * `/health/ready` (que pinga o Postgres) entra quando o banco for conectado.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    // Liveness: se o event loop responde, o processo está vivo.
    // Não checa dependências externas de propósito (isso é readiness).
    return this.health.check([]);
  }
}
