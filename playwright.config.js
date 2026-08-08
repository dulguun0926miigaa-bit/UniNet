import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000'
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
const localLaunch = executablePath ? { launchOptions: { executablePath } } : {}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  outputDir: './test-results/playwright',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // A system Chrome/Edge override is useful for local smoke runs without the
    // Playwright media bundle. CI installs Chromium + ffmpeg and retains video.
    video: executablePath ? 'off' : 'retain-on-failure',
    locale: 'mn-MN',
    timezoneId: 'Asia/Ulaanbaatar',
    reducedMotion: 'reduce',
    ...localLaunch,
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'npm run server:start',
      url: `${apiURL}/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: new URL(apiURL).port || '4000',
        APP_URL: baseURL,
        CORS_ORIGINS: baseURL,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --host ${new URL(baseURL).hostname} --port ${new URL(baseURL).port || '5173'} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        VITE_API_URL: `${apiURL}/api`,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
