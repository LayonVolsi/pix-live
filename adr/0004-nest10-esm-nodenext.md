# ADR-0004 — NestJS 10 + ESM puro (NodeNext) e provider atrás de porta

- **Status:** aceito
- **Data:** 2026-07-02
- **Contexto:** o ambiente de desenvolvimento local roda Node 18; o CI roda as LTS
  ativas (20 e 22). A isca precisa buildar e testar igual nos dois mundos, e provar
  engenharia de backend sem acoplar o domínio ao framework nem à conta de um
  provedor de pagamento.

## Decisão

- **NestJS 10** (não 11): roda em Node 18 local **e** em 20/22 no CI. É também a
  razão de a matriz de CI ser `[20, 22]` — 22/24 entram quando o Node local subir.
- **ESM puro**: `"type": "module"`, `moduleResolution: NodeNext`,
  `verbatimModuleSyntax` — imports relativos levam extensão `.js`; decorators via
  `experimentalDecorators` + `emitDecoratorMetadata`.
- **Domínio puro isolado**: `packages/core` sem nenhuma dependência de runtime —
  HMAC, idempotência e máquina de estados testáveis sem framework nem banco.
- **Provider de pagamento atrás de uma porta** (`PaymentProvider`): o adapter
  **mock** roda 100% offline (QR real, `settle` stateful) e destrava dev, CI e demo
  sem conta no MP; o adapter do SDK oficial entra na fase 4 pela mesma interface.
  `PAYMENT_PROVIDER=mock` é **proibido em produção** (trava no schema de env) e o
  boot lança erro para `mercadopago` até o adapter existir — fail-fast em vez de
  promessa silenciosa.

## Alternativas consideradas

- **Nest 11 direto:** exigiria Node 20+ local (upgrade pendente) — adiada, não
  rejeitada; a migração é mecânica quando o ambiente subir.
- **CommonJS:** evitaria o atrito da extensão `.js`, mas contraria a direção do
  ecossistema e do próprio toolchain (vitest/tsx) — rejeitada.
- **SDK do MP direto nos services:** acoplaria domínio a rede/credenciais e mataria
  o modo offline — rejeitada.

## Consequências

- Imports relativos com `.js` em todo o monorepo (custo aceito do ESM puro).
- A matriz de CI documentada é 20/22; a meta 22/24 do SPEC fica registrada como
  delta consciente (ver "Deltas do build vs spec" no `SPEC.md`).
- O caminho `mercadopago` é intransitável por configuração até a fase 4 — nenhum
  usuário consegue ligar um provider que não existe.
