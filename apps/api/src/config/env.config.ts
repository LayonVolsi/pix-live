import { z } from 'zod';

/**
 * Validação fail-fast do ambiente (Zod), executada no boot: se o ambiente estiver
 * incoerente, o processo nem sobe — melhor falhar no arranque que em produção.
 *
 * Novas variáveis (segredos como MP_WEBHOOK_SECRET, URLs como DATABASE_URL, e
 * valores não-secretos como DEMO_TOKEN/PAYMENT_PROVIDER) entram aqui conforme as
 * camadas da API forem construídas — nunca lidas cru de `process.env` fora deste ponto.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith('postgres'), {
        message: 'DATABASE_URL deve ser uma URL Postgres (postgres:// ou postgresql://)',
      }),
    PAYMENT_PROVIDER: z.enum(['mock', 'mercadopago']).default('mock'),
    // Segredo do webhook (verificação HMAC). Mínimo defensivo de comprimento.
    MP_WEBHOOK_SECRET: z.string().min(16, 'MP_WEBHOOK_SECRET deve ter ao menos 16 caracteres'),
    // Token de demonstração das rotas /admin — NÃO é segredo (o front pré-anexa e
    // a UI rotula como público). Só evita cliques acidentais de bot; rate-limit à parte.
    DEMO_TOKEN: z.string().min(8, 'DEMO_TOKEN deve ter ao menos 8 caracteres'),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'mock'), {
    message: 'PAYMENT_PROVIDER=mock é proibido em produção (trava de segurança)',
    path: ['PAYMENT_PROVIDER'],
  });

export type Env = z.infer<typeof EnvSchema>;

/** Valida um objeto de ambiente cru; lança com mensagem legível se inválido. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração de ambiente inválida — ${issues}`);
  }
  return parsed.data;
}

/** Atalho para validar o `process.env` do runtime. */
export function loadEnv(): Env {
  return validateEnv(process.env);
}
