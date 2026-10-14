import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable (any static host / sub-path). Routing is hash-based.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
