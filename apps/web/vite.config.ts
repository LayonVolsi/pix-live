import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev same-origin: o browser fala só com o Vite; /api vai pra API local.
    // CORS fica desnecessário em dev (fail-closed) — entra restrito no deploy (B1).
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
