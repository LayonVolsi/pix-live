# ADR 0006 — Adapter do Mercado Pago com `fetch` nativo, não com o SDK oficial

- **Status:** aceito
- **Data:** 2026-07-12
- **Contexto:** a fase do sandbox real precisa falar com a API do Mercado Pago. O
  `SPEC.md` original previa "SDK oficial `mercadopago` encapsulado atrás de um
  adapter". Ao desenhar a peça, a auditoria (SAST + auth, em paralelo) exigiu seis
  travas — host fixo, `redirect: 'error'`, timeout curto, teto de bytes na
  resposta, validação Zod do payload e erro que nunca carrega o corpo do provedor.
  Essas travas são precisamente o que um SDK genérico administra por conta própria,
  atrás da própria configuração.

## Decisão

Adapter escrito à mão sobre o `fetch` nativo do Node, sem SDK.

**Racional (nesta ordem de peso):**

1. **As travas são o produto.** Um SDK de pagamento tipicamente expõe base-URL /
   região como opção de configuração — exatamente a superfície de SSRF que a gente
   quer _eliminar por construção_, não herdar. Com `fetch`, `MP_API_BASE_URL` é uma
   `const` de módulo: não existe caminho de código que mande a requisição para
   outro host.
2. **Cadeia de suprimentos.** Este repositório vende higiene de dependências
   (Renovate, digests pinados, Trivy, overrides curados à mão). Puxar um SDK e sua
   árvore transitiva para fazer **dois** `fetch` autenticados contradiz a própria
   tese.
3. **Escopo real.** A integração é `POST /v1/payments` e `GET /v1/payments/:id`.
   Não há OAuth dance, não há paginação, não há webhooks assinados pelo SDK (a
   verificação HMAC já é nossa, no `packages/core`). Um cliente HTTP fino não
   justifica uma dependência.
4. **Testabilidade offline.** O `fetch` é injetado no construtor: a suíte exercita
   404, 401, 429, 5xx, timeout, JSON inválido, corpo gigante, status desconhecido e
   redirect **sem tocar a rede**. O CI nunca chama o Mercado Pago.

## Consequências

- **Divergência explícita do `SPEC.md`** (que dizia "SDK oficial"). O spec foi
  corrigido no mesmo commit — divergir da própria especificação com racional escrito
  é registro de engenharia; divergir em silêncio é dívida.
- Se o MP mudar o contrato dos dois endpoints, quebramos no schema Zod
  (`invalid_response` → 500 → reentrega) em vez de gravar `undefined` no banco.
  Falha alta e visível, não corrupção silenciosa.
- Perdemos features do SDK que não usamos (outros meios de pagamento, assinaturas,
  marketplace). Aceito: estão fora do escopo declarado.
- O que **não** perdemos: credibilidade. Ela vem de usar o **sandbox oficial** e de
  capturar uma **notificação real** como fixture — o que continua valendo. O SDK é
  um cliente HTTP; ele não muda o que trafega no fio.

## Estado da Camada 1 no modo real

O formato exato do manifesto assinado (`data.id` da query string, normalizado)
está implementado de forma **correta sob as duas hipóteses** de origem do id — e
**fail-closed** quando query e corpo divergem. Mas ele só está **verificado
empiricamente** quando uma notificação real do sandbox for capturada (exige URL
pública). Até lá, o `SECURITY.md` declara essa verificação como **pendente**, e
`PAYMENT_PROVIDER=mercadopago` **não é default em lugar nenhum**.
