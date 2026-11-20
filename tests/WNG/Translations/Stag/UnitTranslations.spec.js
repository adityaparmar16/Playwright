import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();
import { setupTranslationTest, runTranslationCheck, translationLang } from '../../../../utils/translationFlow.js';

// Translation regression – Unit, WNG Stag
// Baseline: tests/WNG/Translations/baselines/<lang>/stag-unit.json
const LANG = translationLang();

test.describe(`Translations – Stag Unit (${LANG})`, () => {
  const ctx = setupTranslationTest({
    env: 'stag',
    role: 'unit',
    url: process.env.GLOBAL_STAG_URL,
    username: process.env.GS_UNIT_USERNAME,
    password: process.env.GS_UNIT_PASSWORD,
  });

  test(`Dashboard and Reports modal text matches the ${LANG} baseline`, async ({ page }, testInfo) => {
    await runTranslationCheck(page, testInfo, ctx);
  });
});
