import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// DB scripts and API tests don't use a browser – run them only once (in the chromium project),
// not three times. Matters most for scripts that change data (e.g. CONFIRM_DELETE / CONFIRM_FIX).
const NON_BROWSER_TESTS = ['**/DB/**', '**/API/**'];
// Translation tests switch the account language, so they run on Chromium only –
// parallel runs in other browsers would change the same account's language underneath them.
const CHROMIUM_ONLY_TESTS = ['**/Translations/**'];

export default defineConfig({
  timeout: 90000,
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./utils/emailReporter.js'], // emails the results when SEND_REPORT_EMAIL=true
  ],

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [...NON_BROWSER_TESTS, ...CHROMIUM_ONLY_TESTS],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: [...NON_BROWSER_TESTS, ...CHROMIUM_ONLY_TESTS],
    },
  ],

  metadata: {
    dbproduction: {
      host: process.env.DB_PROD_HOST,
      user: process.env.DB_PROD_USER,
      password: process.env.DB_PROD_PASSWORD,
    },

    dbproductionWrite: {
      host: process.env.DB_PROD_WRITE_HOST,
      user: process.env.DB_PROD_WRITE_USER,
      password: process.env.DB_PROD_WRITE_PASSWORD,
    },

    dbdev: {
      host: process.env.DB_DEV_HOST,
      user: process.env.DB_DEV_USER,
      password: process.env.DB_DEV_PASSWORD,
    },

    dbdevWrite: {
      host: process.env.DB_DEV_WRITE_HOST,
      user: process.env.DB_DEV_WRITE_USER,
      password: process.env.DB_DEV_WRITE_PASSWORD,
    },

    dbstag: {
      host: process.env.DB_STAG_HOST,
      user: process.env.DB_STAG_USER,
      password: process.env.DB_STAG_PASSWORD,
    },

    dbstagWrite: {
      host: process.env.DB_STAG_WRITE_HOST,
      user: process.env.DB_STAG_WRITE_USER,
      password: process.env.DB_STAG_WRITE_PASSWORD,
    },

    globaldev: {
      host: process.env.GLOBAL_DEV_HOST,
      user: process.env.GLOBAL_DEV_USER,
      password: process.env.GLOBAL_DEV_PASSWORD,
    },

    globalstag: {
      host: process.env.GLOBAL_STAG_HOST,
      user: process.env.GLOBAL_STAG_USER,
      password: process.env.GLOBAL_STAG_PASSWORD,
    },

    globalprod: {
      host: process.env.GLOBAL_PROD_HOST,
      user: process.env.GLOBAL_PROD_USER,
      password: process.env.GLOBAL_PROD_PASSWORD,
    },

    globaldevWrite: {
      host: process.env.GLOBAL_DEV_WRITE_HOST,
      user: process.env.GLOBAL_DEV_WRITE_USER,
      password: process.env.GLOBAL_DEV_WRITE_PASSWORD,
    },

    globalstagWrite: {
      host: process.env.GLOBAL_STAG_WRITE_HOST,
      user: process.env.GLOBAL_STAG_WRITE_USER,
      password: process.env.GLOBAL_STAG_WRITE_PASSWORD,
    },

    globalprodWrite: {
      host: process.env.GLOBAL_PROD_WRITE_HOST,
      user: process.env.GLOBAL_PROD_WRITE_USER,
      password: process.env.GLOBAL_PROD_WRITE_PASSWORD,
    }
  },
});