import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./server/test/setup.js'],
    include: ['server/test/**/*.test.js', 'src/**/*.test.js'],
    exclude: ['server/test/**/*.integration.test.js', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'server/src/auth/**/*.js',
        'server/src/middleware/**/*.js',
        'server/src/surveys/survey.validation.js',
        'server/src/tickets/**/*.js',
        'server/src/utils/**/*.js',
        'server/src/validation/**/*.js',
        'src/api/apiClient.js',
        'src/memberships/membershipService.js',
      ],
      exclude: ['server/src/types/**'],
      thresholds: {
        statements: 55,
        branches: 55,
        functions: 50,
        lines: 55,
      },
    },
  },
})
