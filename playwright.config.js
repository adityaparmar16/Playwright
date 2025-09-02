import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
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
  // custom env variables for DBs (like Cypress env)
  metadata: {
    db: {
      host: "rds-dev-newput.bamco.internal",
      user: "user_newput_sonam",
      password: "SjEys0Evx87UrgAuezP4VfF18flgEjA0701Z0n+JnqI=",
    },
    dbproduction: {
      host: "rds-production.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    },
    dbdev: {
      host: "rds-dev.bamco.internal",
      user: "user_newput_aditya",
      password: "sDDAn7Qg4u4CG5",
    }
  },
});
