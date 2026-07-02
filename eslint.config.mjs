import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import security from 'eslint-plugin-security';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Regras com informação de tipo só onde há tsconfig (o código dos pacotes).
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      security.configs.recommended,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: rootDir },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      'no-console': 'error',
      // Ruidoso e propenso a falso-positivo; a segurança real é coberta por testes e revisão.
      'security/detect-object-injection': 'off',
    },
  },
  {
    // Arquivos de configuração na raiz: sem type-check, com globals de Node.
    files: ['*.{mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
