import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/specs',
  timeout: 180_000,
  workers: 1,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
  },

  webServer: [
    {
      command: 'cd server && NODE_ENV=test PORT=3001 DATA_DIR=./data-test APP_URL=http://localhost:5174 npx tsx --env-file=../.env src/index.ts',
      port: 3001,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'cd client && VITE_SERVER_PORT=3001 npx vite --port 5174',
      port: 5174,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
