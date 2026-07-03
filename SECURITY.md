# Política de Segurança — Pix Live

> **English, in one line:** Pix Live is a **sandbox** portfolio demo — it does **not** move real
> money. To report a security issue, open a [private security advisory](https://github.com/racionalmengo/pix-live/security/advisories/new)
> or e-mail `security@example.com` (placeholder — replace before publishing). Details below (in PT-BR).

Este documento descreve o **modelo de ameaças** (threat model) do Pix Live e a **política de
divulgação responsável** (responsible disclosure). Ele é parte da prova de engenharia da isca: o
objetivo não é só o código estar seguro, mas o raciocínio de segurança estar **explícito e
auditável**.

---

## 0. Postura e escopo

- **É uma demo que não move dinheiro real.** Hoje o Pix Live roda em **modo mock 100% offline**
  (nenhuma chamada de saída); a integração com o **sandbox oficial do Mercado Pago (MP)** é a
  fase 4 (_planejado_ — o boot proíbe `PAYMENT_PROVIDER=mercadopago` até o adapter existir,
  `payment.module.ts`). Não há claim de "pronto para produção financeira". O banner permanente na
  UI declarando isso entra com o front (_planejado_).
- **Escopo minúsculo, barra de produção.** O código de domínio (`packages/core`) é puro e
  determinístico, com cobertura **≥90% imposta no CI**. As garantias de segurança abaixo valem
  para o pipeline do webhook, a separação de rotas e a cadeia de suprimentos — o que ainda não
  existe está marcado como _planejado_.
- **O que esta demo NÃO tenta defender** (não-objetivos declarados — ver §9): não há autenticação de
  usuário final, não há proteção de dados financeiros reais, e as ações administrativas são
  protegidas por um token **explicitamente não-secreto** para dar fricção zero ao avaliador. Isso é
  uma decisão consciente de produto de demonstração, não uma omissão.

---

## 1. Ativos protegidos

| Ativo                                                                           | Por que importa                                             | Ameaça principal                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| **Corretude do crédito do pedido** ("dinheiro não duplica")                     | É a promessa central do produto                             | Entrega duplicada do provedor creditando 2×              |
| **Autenticidade do webhook**                                                    | Só o MP pode confirmar um pagamento                         | Forjar um webhook e marcar pedido como pago sem pagar    |
| **Segredo do webhook (`MP_WEBHOOK_SECRET`)** e, na fase 4, o access token do MP | Comprometê-los quebra a Camada 1 e permite agir como a loja | Vazamento em código, log, `.env` ou history              |
| **PII do pagador (e-mail)**                                                     | LGPD / exposição de dado pessoal a visitante anônimo        | Vazamento no painel público de conciliação               |
| **Integridade da cadeia de suprimentos**                                        | Dependência ou GitHub Action comprometida injeta código     | Typosquatting, tag mutável sequestrada, action maliciosa |

---

## 2. Fronteiras de confiança e atores

> O diagrama descreve a **arquitetura-alvo**. O site estático (React) e o adapter do MP são
> _planejados_; hoje o provider é o mock offline, sem nenhuma chamada de saída.

```
[ visitante anônimo / avaliador ]
        │  (não confiável)
        ▼
┌─────────────────────────────────────────────┐
│  Site estático (React) — CSP + headers        │
└─────────────────────────────────────────────┘
        │  HTTP
        ▼
┌─────────────────────────────────────────────┐
│  API NestJS (/api/v1)                         │
│                                               │
│  ── superfície PÚBLICA ──                     │
│   • leitura: painel de conciliação (PII       │
│     mascarada no backend)                     │
│   • POST /webhooks/mercadopago  ← 3 camadas   │
│                                               │
│  ── superfície ADMIN (/admin/*) ──            │
│   • demo-token NÃO-secreto + rate limit        │
│     mais agressivo                            │
└─────────────────────────────────────────────┘
        │  (host MP fixo — sem SSRF)   │ chamada em processo (confiável)
        ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│  MP sandbox       │          │  packages/core    │
│  (semi-confiável) │          │  (domínio puro)   │
└──────────────────┘          └──────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  PostgreSQL — constraint de unicidade é a      │
│  fonte da verdade da idempotência              │
└─────────────────────────────────────────────┘
```

**Atores:**

- **Visitante anônimo / avaliador** — não confiável. Pode ler o painel público e disparar as ações
  admin (por design, com o demo-token pré-anexado). Não pode forjar um webhook válido nem relaxar a
  Camada 2.
- **Mercado Pago (sandbox)** — semi-confiável. Prova de autenticidade é o HMAC, não a origem IP.
  Entrega **at-least-once**: o mesmo pagamento pode chegar N vezes. O sistema trata isso como normal.
- **Rota /admin autenticada** — confiável **apenas para marcar `source='admin_replay'`** na chamada
  em processo ao core. Esse valor **nunca** vem de input HTTP na rota pública.
- **`packages/core`** — confiável, puro, sem I/O nem framework. Recebe fatos já apurados e decide.

---

## 3. As três camadas de defesa do webhook

A rota pública `POST /webhooks/mercadopago` é a única superfície onde um atacante fala com o núcleo
do dinheiro. Ela tem **três camadas independentes** — cada uma fecha um vetor distinto, e **nenhuma**
aceita flag/cabeçalho do cliente que relaxe a camada seguinte.

### Camada 1 — Autenticidade (HMAC-SHA256 em tempo constante)

- Lê o **raw body** (os bytes originais, preservados para a trilha de auditoria com fidelidade
  byte-a-byte — persistidos apenas quando a assinatura é válida; no esquema do MP o HMAC cobre o
  **manifesto** `id`/`request-id`/`ts`, não o corpo), com **cap de tamanho** no parser. Apenas
  `application/json` é parseado — corpo em outro formato não produz `data.id` e falha fechado
  em 401 (comportamento do parser, não uma checagem ativa de Content-Type).
- Remonta o **manifesto exato** do MP a partir dos componentes (`id`, `request-id`, `ts`) e compara
  o HMAC contra o header `x-signature`.
  - Manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (ver `packages/core/src/signature.ts`).
- **Comparação em tempo constante** via `crypto.timingSafeEqual`, com **falha fechada**: hex
  inválido, comprimentos diferentes ou buffer vazio → `false`, sem lançar (evita timing side-channel
  e evita 500 informativo).
- **Assinatura inválida ou ausente → HTTP 401**, verdict `assinatura_invalida`, **sem tocar no
  pedido**. É o único caminho que devolve 401.
- **Anti-flood por construção:** o caminho da assinatura inválida custa **zero I/O de banco** — o
  corpo não é persistido e nenhuma consulta é feita antes do veredito da Camada 1 (coberto por
  teste de integração: "assinatura inválida → 401 e zero escrita no banco").

> **Vetor fechado:** forjar um webhook "pagamento aprovado" sem o segredo. Sem o `MP_WEBHOOK_SECRET`
> o atacante não produz um `v1` válido, e a comparação em tempo constante não vaza informação byte a
> byte.

### Camada 2 — Anti-replay (janela de timestamp + dedupe de delivery-id)

- **Dedupe real por `x-request-id`** através de um **unique composto `(source, request_id_header)`**
  no banco — equivalente, na prática, a um índice parcial por origem. Um delivery-id já processado →
  verdict `duplicata_ignorada`, HTTP 200 (ack), sem re-creditar.
- **Janela de timestamp GENEROSA (24h)** sobre o campo `ts` — ver a nota honesta em §4. Um `ts` fora
  da janela **com HMAC válido** vira **sinal** (`ts_suspeito`), **não** rejeição.

> **Vetor fechado:** reenviar uma entrega legítima capturada para creditar de novo. O dedupe por
> delivery-id barra a repetição; a janela de timestamp limita a utilidade de um replay muito antigo
> **sem** descartar uma reentrega legítima tardia (trade-off consciente — §4).

### Camada 3 — Idempotência de crédito (exatamente uma vez, garantida pelo banco)

- O crédito é gravado com **constraint de unicidade em `mp_payment_id`** (`OrderCredit`) **dentro de
  uma transação**. Duas entregas simultâneas do mesmo pagamento correm: **uma vence a constraint, a
  outra recebe violação de unicidade e é tratada como `duplicata_ignorada`**.
- A idempotência é **do banco, não de um `if` em memória** — resiste a corrida entre workers/réplicas,
  que um cache em processo não resistiria.
- A ordem do veredito é intencional e testada (`packages/core/src/idempotency.ts`):
  `assinatura_invalida` → `duplicata_ignorada` (request-id) → `pagamento_desconhecido` →
  `duplicata_ignorada` (crédito já existe) → `ts_suspeito` → `processado`.

> **Vetor fechado:** a promessa central. Mesmo que Camadas 1 e 2 deixem passar uma reentrega
> legítima (o caso normal at-least-once), o crédito **nunca** dobra.

**Contrato de status HTTP** (`httpStatusForVerdict`): **401** só para assinatura inválida; **500** só
para erro interno; **todo o resto é 200 (ack)** — para o provedor parar de reentregar. A reentrega é
inofensiva porque o processamento é idempotente.

### Invariantes adicionais do pipeline (implementadas e testadas)

- **Status e valor nunca vêm do corpo do webhook.** O corpo só aponta o `data.id`; o status vem de
  **consulta autenticada ao provedor** e o valor do crédito vem do **pedido** (`order.amountCents`)
  — um webhook forjado "aprovado" não tem como injetar estado nem valor.
- **Falha transitória na consulta ao provedor → 500 sem persistir evento.** O delivery-id não é
  gravado, então o dedupe da Camada 2 **não é envenenado** e a reentrega do provedor completa o
  crédito depois. (Fecha um achado ALTO da revisão adversarial interna — perda de crédito sob falha
  de rede — pego pelo pipeline antes de qualquer cliente.)
- **Optimistic lock no update de status do pedido:** uma atualização concorrente não sobrescreve um
  `paid` já gravado.
- **Idempotência de saída** (`OutboundIdempotencyKey`): o retry da criação de cobrança não duplica
  a chamada ao provedor — o mesmo cuidado da entrada, aplicado na direção oposta.

---

## 4. Nota honesta: a semântica do campo `ts` do MP (a confirmar)

**Esta é a ressalva mais importante do threat model — declarada, não escondida.**

A semântica exata do campo `ts` na assinatura do Mercado Pago (se ele é **re-assinado a cada
tentativa** de entrega, ou **fixo** no momento do evento) **precisa ser confirmada contra a
documentação atual do provedor** na implementação. Disso depende quão apertada a janela anti-replay
pode ser sem gerar falso-positivo.

**Postura segura até a confirmação:**

- **Janela generosa por padrão: 24h** (`DEFAULT_ANTI_REPLAY_WINDOW_MS`), **não** 5 minutos. Uma
  janela apertada demais transformaria a _correção de segurança_ (anti-replay) numa _regressão de
  negócio_ — descartar permanentemente uma reentrega legítima tardia do provedor (Risco 11 do SPEC).
- **`ts` fora da janela, com HMAC válido → sinal, não hard-reject.** Registra verdict `ts_suspeito`,
  **credita mesmo assim** (`verdictResultsInCredit('ts_suspeito') === true`) e **não** devolve 401.
  O sinal fica na trilha de auditoria para inspeção, sem quebrar disponibilidade.
- **Rejeição de fato** só acontece quando: (a) a **assinatura é inválida** (401), ou (b) o
  **request-id já foi processado** (dedupe real). Essas são as únicas barreiras duras.

Quando a semântica for confirmada, a janela pode ser calibrada (documentado no `adr/0002`). Enquanto
não for, a postura é **fail-safe para disponibilidade** sem abrir a porta do dinheiro (a Camada 3
continua garantindo o crédito único).

**Risco aceito — delimitadores do manifesto.** O manifesto interpola `data.id` e `request-id` no
template `id:...;request-id:...;ts:...;` sem escapar `;`/`:`. Manter o template **byte-a-byte
idêntico** ao do MP é requisito de compatibilidade com o provedor real (mudá-lo quebraria a
verificação), e a ambiguidade teórica só seria explorável por quem já possui o segredo do HMAC —
que domina o vetor por completo. Risco aceito conscientemente; revisitar se o MP mudar o esquema
de assinatura (ver `adr/0002`).

---

## 5. Separação: rota pública vs. rotas `/admin`

O painel de conciliação é **público por design** (é observabilidade de domínio, só leitura). As
ações de **escrita** ("simular confirmação", "reenviar webhook") vivem em rotas **separadas**, nunca
na rota pública de webhook.

- **Rotas admin dedicadas:** `POST /admin/orders/:publicRef/simulate` e
  `POST /admin/webhook-events/:id/replay`.
- **Demo-token NÃO-secreto** (`DEMO_TOKEN`, ex.: `demo-nao-secreto`). Quando o front existir
  (_planejado_), será pré-anexado por ele e **rotulado na UI** como "token de demonstração pública,
  não é credencial real". Ele existe para dar fricção zero ao avaliador **e** para manter uma
  separação de rota limpa — não para fingir segredo. **Isso é intencional e documentado**, não um
  segredo vazado.
- **Rate limit estratificado por rota, com números:** global 120/min, webhook 30/min, criação de
  pedido 20/min e **admin 10/min** — o mais agressivo justamente no endpoint de escrita sem login,
  alvo óbvio de bot/scraper (Risco 13 do SPEC).
- **`simular confirmação`** monta e assina o payload **server-side** (o `MP_WEBHOOK_SECRET` **nunca**
  toca o browser) e invoca o **mesmo pipeline de verificação em processo** — a Camada 1 valida a
  assinatura de verdade; a chamada não passa pelo transporte HTTP da rota pública.
- **`reenviar webhook`** invoca o pipeline do `packages/core` **diretamente em processo**, passando
  `source='admin_replay'` como parâmetro interno confiável. **Não** faz um novo POST à rota pública,
  logo **não** reabre a Camada 2 a um vetor de forjamento.

> **Vetor fechado (o "backdoor" ambíguo):** a rota pública `/api/v1/webhooks/mercadopago` **nunca**
> aceita parâmetro ou cabeçalho do cliente que desligue a verificação — **estruturalmente**: o
> controller monta o input só com `rawBody`/`data.id`/`x-signature`/`x-request-id`
> (`webhook.controller.ts`) e `source` tem default `mercadopago` no service. O `source='admin_replay'`
> só é gravado por chamada em processo vinda de uma rota admin autenticada. Um teste de integração
> dedicado a provar que a Camada 2 não é relaxável por input HTTP é _planejado_.

---

## 6. PII e mascaramento

- O **e-mail do pagador** é armazenado cru no banco para fins operacionais, mas **mascarado no
  backend** na resposta da API que alimenta a view pública. O mascaramento é responsabilidade do
  **backend, nunca só do CSS/front** (esconder via CSS deixa o dado cru trafegando no JSON — não é
  mascaramento, é maquiagem).
- **Logs estruturados JSON** (pino) com **redaction** de e-mail, token e segredo. Regra de higiene:
  nunca logar PII, segredo ou identificador puro. O campo `error` da trilha de auditoria existe no
  schema para uso futuro; hoje falhas internas **não persistem evento** (para não envenenar o dedupe
  — ver §3) e o detalhe vai apenas ao log estruturado.
- **Contrato de erro problem+json (RFC 9457)** via filtro de exceção centralizado — devolve erro
  estruturado **sem vazar stack trace nem detalhe interno** ao cliente.

> **Vetor fechado:** um visitante anônimo do painel público raspar e-mails de pagadores (Risco 12 do
> SPEC).

---

## 7. Segredos e configuração

- **Segredos reais** (`MP_WEBHOOK_SECRET` hoje; `MP_ACCESS_TOKEN` na fase 4) vivem **apenas** em
  env vars / secret group do host (Render), **nunca** no repositório. O `.env.example` traz defaults
  de desenvolvimento obviamente não-reais (`MP_WEBHOOK_SECRET=troque-este-segredo-de-dev-1234`,
  `DEMO_TOKEN=demo-nao-secreto`); os valores reais só existem no host.
- **`DEMO_TOKEN` não é segredo** (ver §5) — tem valor default no `.env.example` exatamente porque é
  público por design.
- **Fail-fast no boot:** validação com **Zod puro plugada no `ConfigModule`** do Nest
  (`env.config.ts`) — a aplicação **não sobe** com configuração inválida. `MP_WEBHOOK_SECRET`
  (≥16 chars) é obrigatório em **todos** os modos; `MP_ACCESS_TOKEN` entra no schema junto com o
  adapter MP (fase 4 — hoje `mercadopago` é bloqueado por `throw` no `PaymentModule`).
- **`PAYMENT_PROVIDER=mock` é proibido em produção** — trava de segurança no próprio schema de env
  (`refine` do Zod): a aplicação não sobe em produção fingindo provedor.
- **`trust proxy = 1` (exatamente 1 hop):** o rate limit não é enganável por `X-Forwarded-For`
  forjado — só o proxy imediato é confiável.
- **Sem SSRF:** a API **não faz nenhuma chamada HTTP de saída no modo mock**; quando o adapter MP
  entrar (fase 4), o host do provedor será **fixo** — nunca uma URL derivada de input do cliente.
- **Pix-only:** nenhum dado de cartão trafega ou é armazenado — a superfície de PCI simplesmente não
  existe.

---

## 8. Cadeia de suprimentos (supply chain)

Postura de nível big-tech, construída em fases — a tabela distingue o que está **ativo hoje**
(verificável nos workflows do repositório) do que é **_planejado_** (entra com Docker, deploy e
publicação):

**Ativo hoje:**

| Controle                         | O que faz                                                                                                        | Vetor que fecha                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **gitleaks**                     | Varre diff **e** history completo por segredos vazados (`fetch-depth: 0`)                                        | Segredo commitado por acidente                 |
| **CodeQL**                       | SAST JS/TS (injection, path traversal, etc.), SARIF no Security tab, em PR + cron                                | Bug de segurança introduzido no código próprio |
| **dependency-review**            | Diff de dependências no PR; bloqueia vuln HIGH+ introduzida                                                      | Dependência ruim entrando por PR               |
| **GITHUB_TOKEN least-privilege** | `permissions` default `contents: read`, elevado por job só onde necessário (`security-events: write` no CodeQL)  | Token de CI comprometido escrevendo no repo    |
| **Renovate**                     | Mantém versões/digests atualizados (`.github/renovate.json`) e converte as actions para **pin por SHA** na 1ª PR | Rot de dependência; tag mutável sequestrada    |

**_Planejado_ (fase Docker/deploy/publicação):**

| Controle                                     | O que fará                                                                                                   | Vetor que fecha                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Actions SHA-pinned**                       | Toda action de terceiro pinada por **SHA de commit** (hoje: tag, com pin automatizado via Renovate na 1ª PR) | Tag `@v4` sequestrada apontando para código malicioso |
| **GitHub secret scanning (push protection)** | Barra o segredo antes de o push chegar (setting de repo — depende da publicação)                             | Segredo commitado por acidente                        |
| **Trivy**                                    | Scan da imagem Docker; vuln **HIGH/CRITICAL reprova**                                                        | CVE em pacote de sistema da imagem base               |
| **hadolint**                                 | Lint de boas práticas do Dockerfile                                                                          | Anti-padrões de imagem (root, cache, etc.)            |
| **OSV-Scanner**                              | Vulnerabilidades na árvore de dependências completa (PR + cron noturno)                                      | Dependência transitiva vulnerável                     |
| **OpenSSF Scorecard**                        | Nota pública de postura de supply-chain (badge no README)                                                    | Erosão silenciosa da postura de segurança             |
| **SBOM (CycloneDX)**                         | Inventário de dependências anexado ao release                                                                | Falta de rastreabilidade quando um CVE novo aparece   |
| **Dependabot alerts**                        | Alerta de CVE em dependência (setting de repo — depende da publicação)                                       | CVE novo em dependência já usada                      |

**Endurecimento de borda/runtime — ativo hoje:** **helmet** na API; **body-size cap de 32kb** no
parser do webhook; **graceful shutdown** (SIGTERM drena requests em voo e fecha o Prisma).
**_Planejado_:** Dockerfile multi-stage, usuário **non-root**, base pinada por **digest**,
HEALTHCHECK e signal handling PID1 corretos (entram com o Docker); **CORS restrito** e **request
timeout** na API (entram com o `apps/web`, quando existir origem real — o timeout exige teste de
latência contra o pior caso do provedor); **CSP restrita + security headers** (HSTS,
`X-Content-Type-Options: nosniff`, Referrer-Policy, Permissions-Policy, `frame-ancestors`) no
**host estático** (não herda o helmet da API — o QR em base64 permite CSP sem `img-src` externo).

---

## 9. Não-objetivos de segurança (fronteira declarada)

Para não haver overclaim, estes vetores estão **conscientemente fora** do modelo desta demo:

- **Sem autenticação de usuário final** — não há conta, login ou sessão de cliente. Não é uma falha;
  é o escopo.
- **Ações admin não são protegidas por segredo real** — o demo-token é público por design (§5). Em
  produção, essas ações seriam autenticadas de verdade e o botão "reenviar webhook" **não
  existiria** (ver `adr/0003` — honestidade sobre a affordance de demo).
- **Qualquer pedido do painel é alvo legítimo de "simular"/"reenviar"** — o `publicRef` é público
  (aparece no próprio painel de conciliação) e o demo-token também; logo, quem visita a demo pode
  "pagar" ou reenviar o webhook de **qualquer** pedido listado, não só o seu. É intencional numa
  demo de observabilidade pública sem dono de pedido; o freio real é o rate-limit por rota+IP
  (10/min nas rotas `/admin`) e o replay ser fail-closed (só eventos `processado`).
- **`webhook_events` cresce sem cota agregada nem TTL** — o rate-limit é por IP; abuso distribuído
  e sustentado das ações de demo acumula linhas de auditoria sem teto (o painel só exibe as 100
  mais recentes). Risco aceito: não há dinheiro nem PII real em jogo; expurgo/cota entram na fase
  de deploy se o comportamento real justificar.
- **O `qrEmv` do adapter mock embute o id interno do pedido** (`MOCK-PIX|...|order=<uuid>|...`) e
  ele aparece na página pública de pagamento em modo mock. Risco aceito: o mock é **proibido em
  produção** pelo gate de env (Zod), o id não destrava nenhuma ação (as rotas admin usam
  `publicRef`/id de evento), e o formato sintético deixa óbvio que não é um EMV real.
- **Não processa dinheiro real** — é sandbox; não há defesa de fundos reais a se fazer.
- **Não é uma biblioteca de pagamentos reutilizável** — é uma demonstração focada de UMA integração.
- **Sem defesa contra ataque de disponibilidade em escala** (DDoS volumétrico) além do rate limit —
  fora do escopo de uma demo de portfólio.

---

## 10. Política de divulgação responsável (responsible disclosure)

Agradeço relatos de segurança. Como este é um projeto de **portfólio em sandbox que não move dinheiro
real**, o impacto de mundo real é baixo por construção — mas levo a sério qualquer achado, inclusive
como sinal da própria maturidade do repositório.

**Como reportar (em ordem de preferência):**

1. **GitHub Security Advisory (privado):** abra um advisory privado em
   <https://github.com/racionalmengo/pix-live/security/advisories/new>. É o canal preferido — mantém
   o relato confidencial até a correção.
2. **E-mail:** `security@example.com` _(placeholder — substituir por um e-mail real antes de tornar o
   repositório público)_.

**Por favor, faça:**

- Descreva o vetor, o passo a passo de reprodução e o impacto esperado.
- Dê um prazo razoável para correção antes de divulgação pública.
- Use **apenas dados sintéticos** e o **ambiente de sandbox** — nunca dados de terceiros.

**Por favor, NÃO:**

- Não abra uma _issue pública_ para vulnerabilidade **antes** do contato privado.
- Não execute testes destrutivos, de negação de serviço ou contra qualquer infraestrutura que não
  seja a instância de demonstração declarada.

**Compromisso de resposta (melhor esforço, projeto de portfólio mantido por uma pessoa):**

- **Confirmação de recebimento:** em até ~5 dias úteis.
- **Avaliação inicial + severidade:** em seguida à confirmação.
- **Correção:** para achados válidos, o mais rápido possível, com crédito ao relator no CHANGELOG se
  desejado.

**Safe harbor:** pesquisa de boa-fé, dentro desta política e restrita ao ambiente de sandbox, não
será tratada como uso indevido. Este projeto **não** oferece recompensa financeira (bug bounty).

---

## 11. Referências no repositório

- `packages/core/src/signature.ts` — Camada 1 (HMAC em tempo constante, fail-closed).
- `packages/core/src/idempotency.ts` — Camadas 2 e 3 (veredito, janela anti-replay, status HTTP).
- `packages/core/src/order-state-machine.ts` — máquina de estados cobrindo todos os status do MP.
- `adr/0001` — estratégia de idempotência.
- `adr/0002` — verificação de assinatura + política de anti-replay (**inclui a ressalva do campo
  `ts` a confirmar** — §4).
- `adr/0003` — a affordance de replay como ferramenta de demo (honestidade explícita).
- `adr/0004` — Nest 10 + ESM puro e o provider atrás de porta (mock proibido em produção).
- `ARCHITECTURE.md` — diagrama das três camadas e a separação rota-pública vs. admin.
