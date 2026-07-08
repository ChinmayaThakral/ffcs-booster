import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Storage tests use the fake browser directly; avoid WxtVitest()'s config
    // loader, which invokes esbuild and conflicts with the jsdom environment.
    alias: {
      'wxt/browser': '@wxt-dev/browser',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
