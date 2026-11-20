import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Global Admin, WNG Dev
// Baseline: tests/WNG/Translations/baselines/<lang>/dev-global.json
const LANG = translationLang();

test.describe(`Translations – Dev Global Admin (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'dev',
    role: 'global',
    url: process.env.GLOBAL_DEV_URL,
    username: process.env.GD_ADMIN_USERNAME,
    password: process.env.GD_ADMIN_PASSWORD,
    isGlobalAdmin: true, // opens the dashboard via 'Analytics Dashboard View'
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
