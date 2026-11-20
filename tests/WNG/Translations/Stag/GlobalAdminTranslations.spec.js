import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Global Admin, WNG Stag
// Baseline: tests/WNG/Translations/baselines/<lang>/stag-global.json
const LANG = translationLang();

test.describe(`Translations – Stag Global Admin (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'stag',
    role: 'global',
    url: process.env.GLOBAL_STAG_URL,
    username: process.env.GS_ADMIN_USERNAME,
    password: process.env.GS_ADMIN_PASSWORD,
    isGlobalAdmin: true, // opens the dashboard via 'Analytics Dashboard View'
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
