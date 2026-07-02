import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { loadEnv } from './config/env.config.js';

/**
 * Bootstrap da API. Ordem importa: reflect-metadata primeiro (DI do Nest),
 * env validado antes de subir o servidor, helmet/versionamento/shutdown antes
 * de escutar. Segurança e observabilidade são de arranque, não afterthought.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.useGlobalFilters(new ProblemDetailsFilter()); // contrato de erro problem+json (RFC 9457)
  app.enableShutdownHooks(); // SIGTERM drena requests em voo e fecha recursos.

  // /api/v1/... para tudo, menos os probes de saúde (que ficam em /health/*).
  app.setGlobalPrefix('api', { exclude: ['health/(.*)', 'health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pix Live API')
    .setDescription('Checkout Pix com webhook assinado, idempotência e conciliação (sandbox).')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.PORT);
}

void bootstrap().catch((error: unknown) => {
  // no-console é erro no repo; escrevemos direto no stderr e sinalizamos falha.
  process.stderr.write(`Falha no bootstrap da API: ${String(error)}\n`);
  process.exitCode = 1;
});
