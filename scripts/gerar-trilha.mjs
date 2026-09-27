#!/usr/bin/env node
/**
 * TRILHA DA DECISÃO — extrai, do código REAL, o trecho que executa cada passo da trilha
 * (entre os marcadores `// trilha-inicio: <ids>` e `// trilha-fim: <ids>`) e grava
 * apps/web/src/trilha/trechos.gerados.ts. O painel mostra esse trecho quando o visitante
 * abre um passo. Gerado, nunca escrito à mão: trecho copiado à mão apodrece e passa a
 * mostrar código que não é o que roda.
 *
 * Fail-closed, nos dois sentidos:
 *   - todo passo de PASSOS_TRILHA precisa de exatamente um trecho; passo sem trecho, id de
 *     marcador que não está na lista, marcador aberto sem fechar → reprova;
 *   - `--conferir` (CI) reprova se o arquivo versionado difere do que o código gera hoje.
 *
 * Uso:  node scripts/gerar-trilha.mjs            (grava)
 *       node scripts/gerar-trilha.mjs --conferir (só confere; exit 1 se desatualizado)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTES = ['apps/api/src/webhook/webhook.service.ts', 'packages/core/src/idempotency.ts'];
const LISTA = 'apps/api/src/webhook/webhook.service.ts';
const SAIDA = 'apps/web/src/trilha/trechos.gerados.ts';
const REPO = 'https://github.com/LayonVolsi/pix-live/blob/main';

const falhas = [];
const fonteLista = readFileSync(resolve(RAIZ, LISTA), 'utf8');
const bloco = fonteLista.match(/export const PASSOS_TRILHA = \[([\s\S]*?)\] as const;/);
if (!bloco) {
  console.error(`❌ gerar-trilha: PASSOS_TRILHA não encontrado em ${LISTA}`);
  process.exit(1);
}
const passos = [...bloco[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

const trechos = {};
for (const arquivo of FONTES) {
  const linhas = readFileSync(resolve(RAIZ, arquivo), 'utf8').split('\n');
  const abertos = new Map();
  linhas.forEach((linha, i) => {
    const ini = linha.match(/\/\/ trilha-inicio: (.+)$/);
    const fim = linha.match(/\/\/ trilha-fim: (.+)$/);
    if (ini) abertos.set(ini[1].trim(), i);
    if (fim) {
      const chave = fim[1].trim();
      if (!abertos.has(chave)) {
        falhas.push(`${arquivo}:${i + 1} fecha "${chave}" sem abrir`);
        return;
      }
      const de = abertos.get(chave);
      abertos.delete(chave);
      const corpo = linhas.slice(de + 1, i).filter((l) => !/\/\/ trilha-(inicio|fim):/.test(l));
      const recuo = Math.min(...corpo.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
      const codigo = corpo
        .map((l) => l.slice(recuo))
        .join('\n')
        .trimEnd();
      for (const id of chave.split(',').map((x) => x.trim())) {
        if (trechos[id]) falhas.push(`passo "${id}" tem mais de um trecho`);
        trechos[id] = {
          arquivo,
          linhas: `${de + 2}-${i}`,
          url: `${REPO}/${arquivo}#L${de + 2}-L${i}`,
          codigo,
        };
      }
    }
  });
  for (const [chave, i] of abertos) falhas.push(`${arquivo}:${i + 1} abre "${chave}" sem fechar`);
}
for (const id of passos)
  if (!trechos[id]) falhas.push(`passo "${id}" sem trecho de código marcado`);
for (const id of Object.keys(trechos))
  if (!passos.includes(id)) falhas.push(`marcador "${id}" não está em PASSOS_TRILHA`);
if (falhas.length) {
  console.error('❌ gerar-trilha:\n  ' + falhas.join('\n  '));
  process.exit(1);
}

const ordenado = Object.fromEntries(passos.map((id) => [id, trechos[id]]));
const conteudo =
  '// GERADO por scripts/gerar-trilha.mjs a partir do código real — não edite à mão.\n' +
  '// O CI roda `pnpm check:trilha` e reprova se este arquivo estiver desatualizado.\n\n' +
  `export const TRECHOS = ${JSON.stringify(ordenado, null, 2)} as const;\n\n` +
  'export type PassoTrilha = keyof typeof TRECHOS;\n';

if (process.argv.includes('--conferir')) {
  const atual = existsSync(resolve(RAIZ, SAIDA)) ? readFileSync(resolve(RAIZ, SAIDA), 'utf8') : '';
  if (atual !== conteudo) {
    console.error(
      `❌ gerar-trilha: ${SAIDA} está desatualizado — rode \`pnpm gerar:trilha\` e commite.`,
    );
    process.exit(1);
  }
  console.log(`✓ Trilha: ${passos.length} passos, todos com trecho de código, arquivo em dia.`);
} else {
  writeFileSync(resolve(RAIZ, SAIDA), conteudo);
  console.log(`✓ Trilha: ${passos.length} passos gravados em ${SAIDA}.`);
}
