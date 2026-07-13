# ADR-0003 — Replay de webhook como affordance de demonstração

- **Status:** aceito
- **Data:** 2026-07-02
- **Contexto:** a demonstração do projeto é reenviar o mesmo webhook e ver a idempotência
  bloquear a segunda entrega. Em produção esse botão **não existiria** — a Camada 2
  rejeitaria a reentrega pelo dedupe de delivery-id, e ações administrativas seriam
  autenticadas de verdade. A demo precisa da affordance sem abrir um vetor real.

## Decisão

- O botão **"reenviar webhook"** invoca o pipeline do `packages/core`
  **diretamente em processo**, passando `source='admin_replay'` como parâmetro
  interno confiável (o replay gera um `request-id` novo, então não colide com o
  dedupe da entrega original). **Nunca** faz um novo POST à rota pública — a Camada
  2 não é reaberta a nenhum vetor de forjamento.
- O **"simular confirmação"** monta e assina o payload **server-side** (o
  `MP_WEBHOOK_SECRET` nunca toca o browser) e invoca o **mesmo pipeline de
  verificação em processo** — a Camada 1 valida a assinatura de verdade.
- As duas ações vivem em rotas `/api/v1/admin/*` separadas, protegidas por
  **demo-token explicitamente NÃO-secreto** (`DEMO_TOKEN`) com rate limit próprio
  mais agressivo. O token existe para separação de rota e fricção zero do visitante,
  não para fingir segredo — e é rotulado assim.
- A rota pública **estruturalmente não lê** nenhum campo de origem do request: o
  controller monta o input só com `rawBody`/`data.id`/`x-signature`/`x-request-id`,
  e `source` tem default `mercadopago` no service.

## Honestidade declarada

Isto é uma **ferramenta de demo**, não uma feature de produto: em produção, replay
manual de webhook não existe e ações administrativas exigem autenticação real. A
fronteira está declarada no `SECURITY.md` (§5 e §9) para não haver overclaim.

## Consequências

- O visitante exercita o caminho de idempotência real (Camadas 1–3) sem login.
- O demo-token público é alvo esperado de bot — o rate limit estratificado é a
  defesa real, e o dano possível se resume a eventos de demo no próprio sandbox.
