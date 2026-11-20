import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Unit, WNG Prod
// Baseline: tests/WNG/Translations/baselines/<lang>/prod-unit.json
const LANG = translationLang();

test.describe(`Translations – Prod Unit (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'prod',
    role: 'unit',
    url: process.env.GLOBAL_PROD_URL,
    username: process.env.GP_UNIT_USERNAME,
    password: process.env.GP_UNIT_PASSWORD,
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
