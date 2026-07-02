import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    // Os testes de integração compartilham UM Postgres; rodar arquivos em paralelo
    // faria os beforeEach (limpa/cria) se atropelarem (viola FK). Serializa os
    // arquivos — a suíte é pequena, o custo é irrelevante.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts', '**/types.ts', '**/*.d.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
