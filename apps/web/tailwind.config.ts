import type { Config } from 'tailwindcss';

/**
 * Identidade "recibo/extrato": papel, tinta, acento único no teal Pix e
 * monospace tabular pra tudo que é número/ref. Tons escolhidos com contraste
 * AA sobre `papel` (texto normal ≥4.5:1).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontFamily: {
      sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Cascadia Mono', 'monospace'],
    },
    extend: {
      colors: {
        papel: '#faf7f2',
        pauta: '#e4ddd2',
        tinta: {
          DEFAULT: '#1c1914',
          fraca: '#5f584d',
        },
        pix: {
          DEFAULT: '#32bcad',
          escuro: '#0c7268',
          tinta: '#08554e',
        },
        alerta: '#8a4b08',
        erro: '#a3232e',
      },
    },
  },
  plugins: [],
} satisfies Config;
