# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).
A partir da v1.0.0 este arquivo passa a ser mantido automaticamente por
`release-please` a partir dos Conventional Commits.

## [Unreleased]

### Added

- Fundação do monorepo (pnpm workspaces) e `packages/core` — domínio puro:
  verificação HMAC em tempo constante, decisor de idempotência (3 camadas),
  máquina de estados do pedido e formatação BRL. Cobertura de testes 100%.
- Régua de qualidade: TypeScript strict, ESLint 9 type-checked + security,
  Prettier, Vitest, Husky + commitlint, CI (lint/format/typecheck/test/build),
  CodeQL, gitleaks, dependency-review, Renovate.
