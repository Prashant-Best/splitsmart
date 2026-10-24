/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The client imports the server's pure domain module (money, splits, UPI links), so the split
// preview in the browser is computed by exactly the same code the API stores.
const domain = fileURLToPath(new URL('../server/src/domain/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@domain': domain } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
