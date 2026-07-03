// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

// Smoke da casca: jsdom convive com a suíte node/integração no mesmo runner
// (gate C11); layout renderiza wordmark, navegação e o disclaimer obrigatório.
describe('App (casca)', () => {
  afterEach(cleanup);

  it('renderiza wordmark, navegação e o disclaimer de sandbox', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('link', { name: /pix_live/i })).toBeDefined();
    expect(screen.getByRole('navigation', { name: /principal/i })).toBeDefined();
    expect(screen.getByText(/não processa dinheiro real/i)).toBeDefined();
  });
});
