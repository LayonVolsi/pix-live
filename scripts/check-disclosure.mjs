#!/usr/bin/env node
/**
 * Gate de divulgação: impede que estratégia comercial interna (público-alvo,
 * intenção de venda, linguagem que trata o leitor como alvo) chegue ao repositório
 * público.
 *
 * Por que este arquivo existe: a versão anterior deste gate vivia como PROSA num
 * CLAUDE.md e nunca foi executada. Pior, o comando documentado (`git grep`) retorna
 * exit 0 QUANDO ACHA — quem checasse "exit 0 = passou" leria o vazamento como sucesso.
 * Resultado: 62 commits com a tese comercial foram publicados.
 *
 * Dois invariantes deste script, ambos cobertos por teste (check-disclosure.test.mjs):
 *   1. exit 1 quando ACHA (fail-closed). Um gate cuja polaridade não é testada não é gate.
 *   2. Casa a IDEIA, não só a palavra. O termo interno foi trocado por sinônimo e o
 *      texto seguiu dizendo "projeto descartável" e "ataca o medo nº1 do cliente" —
 *      um gate lexical daria verde nisso.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Cada padrão casa uma FORMULAÇÃO da tese comercial, não um vocabulário proibido. */
export const PATTERNS = [
  // O codinome interno e derivados. \b evita casar "fiscal" e "arriscava".
  { re: /\biscas?\b/i, why: 'codinome interno do programa de portfólio' },
  // Tratar o leitor como alvo de venda/avaliação.
  { re: /vaga[-\s]?alvo/i, why: 'declara o público-alvo comercial da peça' },
  { re: /medo\s+n[º°o]?\s*1/i, why: 'enquadra o leitor como alguém a ser persuadido pelo medo' },
  { re: /\bfisga(r|ndo)?\b/i, why: 'metáfora de captura do leitor' },
  { re: /contraste que vende/i, why: 'declara a peça como instrumento de venda' },
  // Desvalorizar a própria peça (lido pelo cliente como "não levo isto a sério").
  { re: /descart[áa]ve(l|is)/i, why: 'declara a peça como descartável' },
  { re: /escopo de brinquedo/i, why: 'autodepreciativo; lido pelo cliente como desleixo' },
  // Artefatos do programa interno de posicionamento.
  { re: /kit de perfil/i, why: 'artefato interno de posicionamento' },
  { re: /trio de (iscas|projetos)/i, why: 'revela o programa de portfólio como conjunto' },
  { re: /wow hook/i, why: 'linguagem de marketing interno' },
  { re: /avaliador t[ée]cnico/i, why: 'enquadra o leitor como avaliador a ser impressionado' },
];

/**
 * Falsos-positivos conscientes, por linha. Formato: 'arquivo:linha'.
 * Nunca desliga a REGRA (que continua valendo para o resto da árvore) — isenta a LINHA.
 *
 * - docker-compose.yml: "descartável" aqui qualifica o BANCO efêmero da demo (uso técnico
 *   correto: o volume é jogado fora entre execuções), não a peça de portfólio.
 */
const ALLOWLIST = new Set(['docker-compose.yml:13']);

function tracked() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

/** Varre também as MENSAGENS de commit: o gate anterior ignorava, e elas são públicas. */
function commitMessages(range) {
  if (!range) return [];
  const out = execFileSync('git', ['log', '--format=%H%x00%B%x00', range], { encoding: 'utf8' });
  return out
    .split('\0\n')
    .filter(Boolean)
    .map((chunk) => {
      const [sha, body] = chunk.split('\0');
      return { sha, body: body ?? '' };
    });
}

export function scanText(text, label) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    const at = `${label}:${i + 1}`;
    if (ALLOWLIST.has(at)) return;
    for (const { re, why } of PATTERNS) {
      if (re.test(line)) hits.push({ at, why, line: line.trim().slice(0, 120) });
    }
  });
  return hits;
}

function main() {
  const range = process.argv[2]; // opcional: ex. origin/main..HEAD
  const hits = [];

  for (const file of tracked()) {
    // O gate declara os padrões e o teste os exercita com fixtures sujas de propósito —
    // ambos casariam a si mesmos. Isentar os dois é o que os torna testáveis de verdade.
    if (file === 'scripts/check-disclosure.mjs' || file === 'scripts/check-disclosure.test.mjs')
      continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // binário/ilegível
    }
    hits.push(...scanText(content, file));
  }

  for (const { sha, body } of commitMessages(range)) {
    hits.push(...scanText(body, `commit ${sha.slice(0, 8)}`));
  }

  if (hits.length > 0) {
    console.error(`\n✗ Gate de divulgação: ${hits.length} ocorrência(s) da tese comercial.\n`);
    for (const h of hits) console.error(`  ${h.at}\n    → ${h.why}\n    │ ${h.line}\n`);
    console.error('Estratégia comercial não mora na árvore publicável.');
    console.error('Mova para ~/Corp/iscas/<projeto>-POSICIONAMENTO.md (fora da pasta do repo).\n');
    process.exit(1); // fail-closed: ACHOU = FALHA. Testado em check-disclosure.test.ts.
  }

  console.log('✓ Gate de divulgação: nenhuma tese comercial na árvore publicável.');
}

// Só executa quando chamado direto (permite importar PATTERNS/scanText no teste).
if (process.argv[1] && process.argv[1].endsWith('check-disclosure.mjs')) main();
