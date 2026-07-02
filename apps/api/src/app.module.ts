import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { validateEnv } from './config/env.config.js';

const isDevelopment = process.env['NODE_ENV'] === 'development';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        // Correlação ponta a ponta: reaproveita um x-request-id de entrada ou gera um.
        genReqId: (req: IncomingMessage, res: ServerResponse): string => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        // Nunca logar segredo/PII: header de assinatura, auth, cookie e e-mail do pagador.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-signature"]',
            'req.body.payer_email',
            'req.body.email',
          ],
          censor: '[redigido]',
        },
        // pino-pretty só em dev (worker thread); em test/prod, JSON estruturado puro.
        ...(isDevelopment
          ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
          : {}),
      },
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
