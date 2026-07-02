# ADR-0002 — Verificação de assinatura HMAC + política de anti-replay

- **Status:** aceito (com ressalva declarada — ver "A ressalva do campo `ts`")
- **Data:** 2026-07-02
- **Contexto:** só o Mercado Pago pode confirmar um pagamento. A prova de
  autenticidade é criptográfica (HMAC), não origem de IP. Ao mesmo tempo, uma
  política de anti-replay apertada demais viraria regressão de negócio: descartar
  permanentemente uma reentrega legítima tardia do provedor.

## Decisão

1. **Autenticidade:** o handler lê o **raw body** (bytes originais, com cap de
   tamanho), remonta o **manifesto exato** do MP a partir dos componentes
   (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;` —
   `packages/core/src/signature.ts`) e compara o HMAC-SHA256 contra o header
   `x-signature` em **tempo constante** (`crypto.timingSafeEqual`), com **falha
   fechada**: hex inválido, comprimentos diferentes ou buffer vazio → `false`, sem
   lançar. Assinatura inválida/ausente → **401**, sem tocar no pedido e sem
   persistir o corpo.
2. **Anti-replay:** dedupe real por `x-request-id` via **unique composto
   `(source, request_id_header)`** no banco, mais janela de timestamp **generosa
   (24h)** sobre o campo `ts`. `ts` fora da janela com HMAC válido vira **sinal**
   (`ts_suspeito`) na trilha de auditoria — credita mesmo assim, não rejeita.

## A ressalva do campo `ts` (a confirmar)

A semântica exata do `ts` na assinatura do MP (re-assinado a cada tentativa de
entrega, ou fixo no momento do evento) **precisa ser confirmada contra a documentação
atual do provedor** na fase do sandbox real. Disso depende quão apertada a janela
pode ser sem falso-positivo. Até lá, a postura é fail-safe para disponibilidade: as
únicas barreiras duras são assinatura inválida (401) e delivery-id repetido — a
Camada 3 (ADR-0001) continua garantindo o crédito único de qualquer forma.

## Risco aceito — delimitadores do manifesto

O manifesto interpola `dataId`/`requestId` sem escapar `;`/`:`. Manter o template
**byte-a-byte idêntico** ao do MP é requisito de compatibilidade (mudá-lo quebraria a
verificação contra o provedor real); a ambiguidade teórica só seria explorável por
quem já possui o segredo do HMAC. Risco aceito e documentado no `SECURITY.md` §4 —
revisitar se o MP mudar o esquema de assinatura.

## Consequências

- O corpo da requisição **não** entra no HMAC (o esquema do MP cobre só o
  manifesto); o raw body é preservado para a trilha de auditoria byte-a-byte,
  persistido apenas quando a assinatura é válida.
- A janela de 24h é parâmetro (`DEFAULT_ANTI_REPLAY_WINDOW_MS`) e pode ser calibrada
  quando a semântica do `ts` for confirmada.
