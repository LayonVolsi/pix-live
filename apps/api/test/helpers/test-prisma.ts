import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/**
 * PrismaService para os testes de integração.
 *
 * O `PrismaService` passou a exigir `ConfigService` (o teto de pool vem de env — ver
 * `withPoolLimits`). Aqui o config lê o `process.env` direto: os testes rodam contra o
 * Postgres real apontado por `DATABASE_URL`, e os limites de pool caem no default.
 */
export function makeTestPrisma(): PrismaService {
  const config = {
    get: (key: string): string | undefined => process.env[key],
  } as unknown as ConfigService;

  return new PrismaService(config);
}
