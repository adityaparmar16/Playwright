import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Global Admin, WNG Prod
// Baseline: tests/WNG/Translations/baselines/<lang>/prod-global.json
const LANG = translationLang();

test.describe(`Translations – Prod Global Admin (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'prod',
    role: 'global',
    url: process.env.GLOBAL_PROD_URL,
    username: process.env.GP_ADMIN_USERNAME,
    password: process.env.GP_ADMIN_PASSWORD,
    isGlobalAdmin: true, // opens the dashboard via 'Analytics Dashboard View'
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
