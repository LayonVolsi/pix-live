import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scanText } from './check-disclosure.mjs';

const SCRIPT = fileURLToPath(new URL('./check-disclosure.mjs', import.meta.url));

/**
 * Este teste existe porque o gate ANTERIOR não tinha um. Ele vivia como prosa num
 * CLAUDE.md, nunca rodou, e o comando que documentava (`git grep`) sai 0 QUANDO ACHA —
 * então "passou no gate" e "vazou" eram indistinguíveis. 62 commits foram publicados assim.
 * Cada `it` abaixo trava uma das três formas pelas quais aquele gate falhou.
 */
describe('gate de divulgação', () => {
  describe('polaridade do exit code (o bug que deixou 62 commits passarem)', () => {
    let repo;

    beforeAll(() => {
      // Repo git isolado: o gate opera sobre `git ls-files`, então precisa de um.
      repo = mkdtempSync(join(tmpdir(), 'disclosure-gate-'));
      execFileSync('git', ['init', '-q'], { cwd: repo });
      execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: repo });
      execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
    });

    afterAll(() => rmSync(repo, { recursive: true, force: true }));

    it('SAI 1 quando ACHA a tese (fail-closed)', () => {
      writeFileSync(join(repo, 'README.md'), 'Este é um projeto descartável de portfólio.\n');
      execFileSync('git', ['add', '-A'], { cwd: repo });

      let exitCode = 0;
      try {
        execFileSync('node', [SCRIPT], { cwd: repo, stdio: 'pipe' });
      } catch (err) {
        exitCode = err.status;
      }
      // Se algum dia isto virar 0, o gate voltou a certificar o vazamento como limpo.
      expect(exitCode).toBe(1);
    });

    it('SAI 0 quando a árvore está limpa', () => {
      writeFileSync(join(repo, 'README.md'), 'Checkout Pix com webhook assinado.\n');
      execFileSync('git', ['add', '-A'], { cwd: repo });

      expect(() => execFileSync('node', [SCRIPT], { cwd: repo, stdio: 'pipe' })).not.toThrow();
    });
  });

  describe('casa a IDEIA, não só a palavra', () => {
    // O commit 51cd1cd trocou o codinome por "projeto" e o texto seguiu vendendo.
    // Um gate lexical (grep do codinome) daria VERDE em cada uma destas linhas.
    it.each([
      ['este é um projeto descartável de escopo minúsculo', 'descartável'],
      ['Ataca o medo nº1 do cliente PME de e-commerce', 'medo nº1'],
      ['**Vaga-alvo:** Integração de pagamentos', 'vaga-alvo'],
      ['**Contraste que vende:** escopo de brinquedo', 'contraste que vende'],
      ['o que fisga um avaliador técnico de big tech', 'fisga / avaliador técnico'],
      ['selecionadas para o trio de projetos públicos', 'trio de projetos'],
    ])('pega a tese em %j (via %s)', (line) => {
      expect(scanText(line, 'f')).not.toHaveLength(0);
    });
  });

  describe('não grita lobo (um gate ruidoso é desligado pelo dono)', () => {
    // Ocorrências REAIS no repo que um grep sem word-boundary casaria com o codinome.
    it.each([
      'a nota fiscal do pedido é emitida depois',
      'o handler arriscava perder o crédito na reentrega',
      'a política fiscal brasileira exige',
    ])('ignora %j', (line) => {
      expect(scanText(line, 'f')).toHaveLength(0);
    });

    it('deixa passar a linguagem honesta que DEVE ficar', () => {
      // A régua: "peça de portfólio, escopo pequeno, acabamento de produção" é honestidade
      // e vende. "isca descartável construída pra atacar seu medo" é a manipulação exposta.
      const honesto =
        'Projeto de portfólio: escopo pequeno, barra de produção. ' +
        'O código de negócio real vive em repositórios fechados — discrição profissional.';
      expect(scanText(honesto, 'f')).toHaveLength(0);
    });
  });
});
