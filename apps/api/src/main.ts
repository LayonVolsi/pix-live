import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
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

  // rawBody: true preserva os bytes originais para o HMAC do webhook.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  // Cap de tamanho NO PARSER (não em checagem de header, que é bypassável via
  // chunked) — o mesmo parser que alimenta req.rawBody. Ver laudo de segurança.
  app.useBodyParser('json', { limit: '32kb' });
  // Exatamente 1 hop de proxy confiável (o LB da Render) — NUNCA `true`, senão
  // um X-Forwarded-For forjado zeraria o rate limit. Confirmar o hop no deploy.
  app.set('trust proxy', 1);

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
