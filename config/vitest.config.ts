import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const testWorkerOptions = { maxWorkers: 4 }

export default defineConfig({
  define: {
    ORCA_FEATURE_WALL_ENABLED: 'true'
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'config/scripts/**/*.test.mjs',
      'tests/e2e/**/*.unit.test.ts'
    ],
    setupFiles: ['config/vitest-dom-storage.ts'],
    // Why: the full suite runs heavy TS transforms plus real git/http fixtures;
    // the Vitest 5s defaults are too tight for the slowest integration cases.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // Why: process/socket integration tests are sensitive to full-suite worker
    // pressure across platforms, especially when native relay setup is active.
    ...testWorkerOptions
  }
})
