import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Entity, WNG Dev
// Baseline: tests/WNG/Translations/baselines/<lang>/dev-entity.json
const LANG = translationLang();

test.describe(`Translations – Dev Entity (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'dev',
    role: 'entity',
    url: process.env.GLOBAL_DEV_URL,
    username: process.env.GD_ENTITY_USERNAME,
    password: process.env.GD_ENTITY_PASSWORD,
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
