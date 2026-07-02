import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Global: o `PrismaService` fica disponível a qualquer módulo sem reimportar.
 * Persistência é infraestrutura transversal — um único pool para toda a app.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
