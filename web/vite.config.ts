import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Web de RIETI. Se compila a `dist/` y la sirve el backend NestJS desde el
 * mismo origen que el API (sin CDN). En desarrollo, `/api` se reenvía al
 * backend local en el puerto 3000.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Sin CSS ni scripts en línea: la CSP solo permite 'self'.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' } },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'] },
});
