# ADR-0001 — Idempotência de crédito por constraint de banco

- **Status:** aceito
- **Data:** 2026-07-02
- **Contexto:** o Mercado Pago entrega webhooks **at-least-once** — o mesmo pagamento
  pode chegar N vezes, inclusive em paralelo. A promessa central do produto é
  "dinheiro não duplica": o crédito de um pagamento precisa ser **exatamente-uma-vez**
  mesmo sob corrida entre entregas simultâneas (e, no futuro, entre réplicas do
  serviço).

## Decisão

O crédito é gravado em `OrderCredit` com **constraint de unicidade em
`mp_payment_id`**, dentro de uma transação. Duas entregas simultâneas do mesmo
pagamento correm: uma vence a constraint; a outra recebe violação de unicidade
(`P2002` no Prisma) e é tratada como `duplicata_ignorada` — HTTP 200 (ack), sem
re-creditar.

A idempotência é **do banco, não de um `if` em memória**. A ordem dos vereditos é
decidida no domínio puro (`packages/core/src/idempotency.ts`) e provada por teste de
integração com corrida real contra Postgres.

## Alternativas consideradas

- **Checagem em memória / cache de processo:** não resiste a corrida entre workers
  nem a restart — rejeitada.
- **Lock distribuído (Redis/advisory lock):** adiciona uma peça de infraestrutura e
  um modo de falha novos para resolver o que uma constraint resolve de graça —
  rejeitada.
- **Dedupe só por delivery-id (Camada 2):** barra a reentrega do mesmo delivery, mas
  não duas entregas com delivery-ids diferentes para o mesmo pagamento — insuficiente
  sozinha.

## Consequências

- Exige banco relacional transacional de verdade (Postgres) — é por isso que a stack
  usa o motor cru, não um cache.
- A violação de unicidade é caminho **esperado** de negócio, não erro: o handler a
  converte em veredito.
- Reentrega torna-se inofensiva por construção, o que permite responder 200 (ack)
  para quase tudo e o provedor parar de reentregar.
