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
    // Teto do pool do Prisma. Sem isto, o Prisma dimensiona por `num_cpus × 2 + 1` lido do
    // CONTAINER — número que nada tem a ver com o teto de conexões do Postgres gerenciado
    // (baixo nos planos de entrada). É env, e não constante, porque o valor correto depende
    // do host: atrás de um pooler (Supabase/PgBouncer em modo transaction) o certo é 1, para
    // não competir com o pooler externo; contra um Postgres cru, calibra-se pelo plano.
    DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().max(100).default(5),
    // Segundos que uma query espera por uma conexão livre antes de falhar. Falhar rápido e
    // alto é melhor que empilhar requests numa fila invisível até o timeout do LB.
    DATABASE_POOL_TIMEOUT: z.coerce.number().int().nonnegative().max(60).default(10),
    PAYMENT_PROVIDER: z.enum(['mock', 'mercadopago']).default('mock'),
    // Segredo do webhook (verificação HMAC). Mínimo defensivo de comprimento.
    MP_WEBHOOK_SECRET: z.string().min(16, 'MP_WEBHOOK_SECRET deve ter ao menos 16 caracteres'),
    // Token de demonstração das rotas /admin — NÃO é segredo (o front pré-anexa e
    // a UI rotula como público). Só evita cliques acidentais de bot; rate-limit à parte.
    DEMO_TOKEN: z.string().min(8, 'DEMO_TOKEN deve ter ao menos 8 caracteres'),
    // Credencial do Mercado Pago. Só faz sentido no modo real — ver as travas abaixo.
    // NUNCA interpolar o VALOR numa mensagem de erro (o boot loga o motivo no stderr).
    MP_ACCESS_TOKEN: z.string().min(1).optional(),
    // E-mail da conta de teste COMPRADORA do sandbox (payer.email da cobrança).
    // Só faz sentido no modo real; obrigatório nele (refine abaixo). A janela de
    // prova (2026-07-12) mostrou que o pagador genérico é RECUSADO pelo MP
    // (`2034 Invalid users involved`/`4390 Payer email forbidden`) — por isso o
    // valor é configurável, não hardcoded. É PII fraca: nunca interpolar em log/erro.
    MP_TEST_PAYER_EMAIL: z.string().email().optional(),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'mock'), {
    message: 'PAYMENT_PROVIDER=mock é proibido em produção (trava de segurança)',
    path: ['PAYMENT_PROVIDER'],
  })
  .refine((env) => env.PAYMENT_PROVIDER !== 'mercadopago' || env.MP_ACCESS_TOKEN !== undefined, {
    message: 'MP_ACCESS_TOKEN é obrigatório quando PAYMENT_PROVIDER=mercadopago',
    path: ['MP_ACCESS_TOKEN'],
  })
  .refine(
    (env) => env.PAYMENT_PROVIDER !== 'mercadopago' || env.MP_TEST_PAYER_EMAIL !== undefined,
    {
      // Fail-fast no boot: a janela de prova mostrou que o pagador genérico é
      // recusado pelo MP. Sem um e-mail de conta de teste compradora, o primeiro
      // clique no modo real vira erro 500 — melhor recusar subir com o motivo claro.
      message:
        'MP_TEST_PAYER_EMAIL é obrigatório quando PAYMENT_PROVIDER=mercadopago ' +
        '(e-mail de conta de teste compradora do sandbox)',
      path: ['MP_TEST_PAYER_EMAIL'],
    },
  )
  .refine((env) => env.MP_ACCESS_TOKEN === undefined || env.MP_ACCESS_TOKEN.startsWith('TEST-'), {
    // Trava PERMANENTE, não "por enquanto". "Não processa dinheiro real" é um
    // não-objetivo declarado do projeto (SECURITY.md §9), não uma fase — então o
    // processo se RECUSA A SUBIR com credencial de produção do MP (`APP_USR-`).
    // Isso transforma a promessa do documento em código executável: quem quiser
    // mover dinheiro de verdade tem que apagar esta linha conscientemente.
    message:
      'MP_ACCESS_TOKEN deve ser credencial de teste (prefixo TEST-). ' +
      'Credencial de produção é proibida: esta demo não processa dinheiro real.',
    path: ['MP_ACCESS_TOKEN'],
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
