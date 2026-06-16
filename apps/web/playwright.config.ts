import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ORIGIN: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_PRIVY_APP_ID: 'cmjtfgkl700dqlb0dd87x5duw',
      NEXT_PUBLIC_SUI_NETWORK: 'mainnet',
      NEXT_PUBLIC_PACKAGE_ID: '0x0',
      NEXT_PUBLIC_LEVO_AGENT_PACKAGE_ID: '0x0',
      LEVO_USD_COIN_TYPE: '0x0::levo_usd::LEVO_USD',
      DATABASE_URL: 'postgresql://e2e:e2e@localhost:5432/e2e',
      REDIS_URL: 'redis://localhost:6379',
      HMAC_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      PRIVY_APP_SECRET: 'e2e-placeholder',
      GAS_STATION_SECRET_KEY: '',
      STABLE_LAYER_MANAGER_SECRET_KEY: '',
      LEVO_HOSTED_AGENT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
