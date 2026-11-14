import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts', 'ui/src/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30_000,
  },
})
