import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
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
    // O apps/web tem bloco próprio abaixo (globals de browser + React).
    files: ['packages/**/*.ts', 'apps/api/**/*.ts'],
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
    // Front (browser): MESMO rigor type-checked do resto, + React/a11y. O gate
    // de no-floating-promises aqui pega mutation disparada em onClick sem
    // tratamento; react/no-danger fecha dangerouslySetInnerHTML por lint (C3).
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      security.configs.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: rootDir },
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-danger': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-console': 'error',
      'security/detect-object-injection': 'off',
    },
  },
  {
    // Arquivos de configuração (raiz e dos workspaces): sem type-check, com
    // globals de Node. O glob raiz sozinho não casa subpastas (matchBase off).
    files: ['*.{mjs,cjs,ts}', 'apps/*/*.{mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
