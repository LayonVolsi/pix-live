import { z } from 'zod';

/**
 * Validação fail-fast do ambiente (Zod), executada no boot: se o ambiente estiver
 * incoerente, o processo nem sobe — melhor falhar no arranque que em produção.
 *
 * Novos segredos/URLs (DATABASE_URL, MP_WEBHOOK_SECRET, DEMO_TOKEN, PAYMENT_PROVIDER)
 * entram aqui conforme as camadas da API forem construídas — nunca lidos cru de
 * `process.env` fora deste ponto.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgres'), {
      message: 'DATABASE_URL deve ser uma URL Postgres (postgres:// ou postgresql://)',
    }),
  PAYMENT_PROVIDER: z.enum(['mock', 'mercadopago']).default('mock'),
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
