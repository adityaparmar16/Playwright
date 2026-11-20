import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Entity, WNG Prod
// Baseline: tests/WNG/Translations/baselines/<lang>/prod-entity.json
const LANG = translationLang();

test.describe(`Translations – Prod Entity (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'prod',
    role: 'entity',
    url: process.env.GLOBAL_PROD_URL,
    username: process.env.GP_ENTITY_USERNAME,
    password: process.env.GP_ENTITY_PASSWORD,
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
