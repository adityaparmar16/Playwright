import { defineConfig, devices } from '@playwright/test';

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

  // custom DB metadata
  // custom env variables for DBs
  metadata: {
    dbproduction: {
      host: "rds-production.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    },
    dbproductionWrite: {
      host: "rds-production.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    },
    dbdev: {
      host: "rds-dev.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    },
    dbdevWrite: {
      host: "rds-dev.bamco.internal",
      user: "user_newput_mansi",
      password: "+Oba4j+cPIqtA7t7k+xtbU8taz6E7DhcnIsVbDnpWmI=",
    },
    globaldev: {
      host: "wastenot-rds-dev.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    },
    globalprod: {
      host: "wastenot-rds-production.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    }
  },
});
