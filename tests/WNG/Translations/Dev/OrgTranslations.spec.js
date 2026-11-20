import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Org, WNG Dev
// Baseline: tests/WNG/Translations/baselines/<lang>/dev-org.json
const LANG = translationLang();

test.describe(`Translations – Dev Org (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'dev',
    role: 'org',
    url: process.env.GLOBAL_DEV_URL,
    username: process.env.GD_ORG_USERNAME,
    password: process.env.GD_ORG_PASSWORD,
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
