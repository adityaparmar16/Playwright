import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  timeout: 90000,
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

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
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
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

    dbstag: {
      host: process.env.DB_STAG_HOST,
      user: process.env.DB_STAG_USER,
      password: process.env.DB_STAG_PASSWORD,
    },

    dbdevWrite: {
      host: process.env.DB_DEV_WRITE_HOST,
      user: process.env.DB_DEV_WRITE_USER,
      password: process.env.DB_DEV_WRITE_PASSWORD,
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
    }
  },
});