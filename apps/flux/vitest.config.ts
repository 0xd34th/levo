import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';

import { defineConfig } from 'vitest/config';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const storybookConfigDir = path.join(dirname, '.storybook');
const hasStorybookConfig = fs.existsSync(
  path.join(storybookConfigDir, 'main.ts'),
);

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          globals: true,
        },
        resolve: {
          alias: {
            '@': path.resolve(dirname, './src'),
            src: path.resolve(dirname, './src'),
          },
        },
      },
      {
        plugins: [react()],
        extends: true,
        test: {
          name: 'snapshots',
          include: ['src/**/*.snapshot.spec.{ts,tsx}'],
          setupFiles: ['./vitest.setup.tsx'],
          environment: 'jsdom',
          globals: true,
        },
        resolve: {
          alias: {
            '@': path.resolve(dirname, './src'),
            src: path.resolve(dirname, './src'),
          },
        },
      },
      ...(hasStorybookConfig
        ? [
            {
              extends: true,
              plugins: [
                // The plugin will run tests for the stories defined in your Storybook config
                // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
                storybookTest({ configDir: storybookConfigDir }),
              ],
              test: {
                name: 'storybook',
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright(),
                  instances: [{ browser: 'chromium' }],
                },
                setupFiles: ['.storybook/vitest.setup.ts'],
              },
            },
          ]
        : []),
    ],
  },
});
