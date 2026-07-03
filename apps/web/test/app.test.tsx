// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

// Smoke do scaffold: prova que jsdom convive com a suíte node/integração no
// mesmo runner (gate C11) e que a casca renderiza com o disclaimer obrigatório.
describe('App (scaffold)', () => {
  afterEach(cleanup);

  it('renderiza o título e o disclaimer de sandbox', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /pix live/i })).toBeDefined();
    expect(screen.getByText(/não processa dinheiro real/i)).toBeDefined();
  });
});
