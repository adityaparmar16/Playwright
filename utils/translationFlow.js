import { test, expect } from '@playwright/test';
import path from 'path';

import { LoginPage, DashboardPage } from '../Page/GlobalPage.js';
import { TranslationPage, LANGUAGES } from '../Page/TranslationPage.js';
import { testData } from './testData.js';
import {
  collectTexts, normalizeTexts, diffTexts, isVolatile, baselinePath, loadBaseline, saveJson,
} from './translations.js';

// ═══════════════════════════════════════════════════════════════
//  SHARED TRANSLATION REGRESSION TEST (WNG)
//  Each admin spec calls setupTranslationTest({...}) + runTranslationCheck().
//  1st run saves tests/WNG/Translations/baselines/<lang>/<env>-<role>.json,
//  later runs compare against it. No DB checks, no schedule creation.
//    TRANSLATION_LANG=fr-CA (default)     language to test
//    UPDATE_TRANSLATION_BASELINE=true      overwrite the baseline with this run
// ═══════════════════════════════════════════════════════════════

// English strings that must NOT appear once the UI is translated (basic sanity)
const ENGLISH_MARKERS = ['Analytics Dashboard', 'Select a Unit', 'Send Now', 'REPORTS'];

export function translationLang() {
  return process.env.TRANSLATION_LANG || 'fr-CA';
}

// Registers login + reset-to-English hooks. Call inside test.describe in the spec.
// Returns a context object that runTranslationCheck() uses.
export function setupTranslationTest({ env, role, url, username, password, isGlobalAdmin = false }) {
  const ctx = {
    LANG: translationLang(),
    UPDATE: process.env.UPDATE_TRANSLATION_BASELINE === 'true',
    EMAIL: testData.reportEmail,
    ENV: env.toLowerCase(),
    ROLE: role.toLowerCase(),
    username, isGlobalAdmin,
    tp: null,
    languageChanged: false,
  };

  test.describe.configure({ mode: 'default' });
  test.setTimeout(240000);

  test.beforeEach(async ({ page }) => {
    ctx.languageChanged = false;
    const loginPage = new LoginPage(page);
    await loginPage.goto(url);
    await loginPage.assertPageLoaded();
    await loginPage.login(username, password);
    ctx.tp = new TranslationPage(page);
  });

  test.afterEach(async () => {
    if (!ctx.languageChanged || ctx.LANG === 'en') return;
    try {
      await ctx.tp.resetToEnglish();
      console.log('Account language reset to English');
    } catch (err) {
      // Fail the test: a user left in another language breaks every later run
      throw new Error(`Could not reset language to English for ${username} – the next run will try to self-heal. ${err.message}`);
    }
  });

  return ctx;
}

export async function runTranslationCheck(page, testInfo, ctx) {
  const { LANG, UPDATE, EMAIL, ENV, ROLE, tp } = ctx;
  testInfo.setTimeout(ctx.isGlobalAdmin ? 360000 : 240000);

  // 0. While still in English, remember where the analytics tile is on the home page,
  //    then open the analytics dashboard once to learn its URL
  const dashboard = new DashboardPage(page);
  const entryBtn = ctx.isGlobalAdmin ? dashboard.analyticsDashboardViewBtn : dashboard.analyticsDashboardBtn;

  // Self-heal: if an earlier run was interrupted before it reset the language, the
  // account is still in another language and the English entry button is missing.
  const loginHome = page.url();
  const isEnglish = await entryBtn.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (!isEnglish) {
    console.warn(`⚠ [${ROLE}] Account is not in English (left over from an earlier run?) – resetting to English first`);
    ctx.languageChanged = true;
    await tp.setLanguage('en');           // verified – throws if it cannot be saved
    await page.goto(loginHome);
  }

  if (ctx.isGlobalAdmin) await expect(dashboard.globalAdminLabel).toBeVisible({ timeout: 30000 });
  await tp.rememberDashboardEntry(entryBtn);
  // Open the analytics dashboard (Global admin gets a longer wait – it loads all program data)
  tp.dashboardTimeout = ctx.isGlobalAdmin ? 120000 : 45000;
  await entryBtn.click();
  await tp.waitForDashboard();
  const analyticsUrl = page.url();
  console.log(`[${ROLE}] Analytics dashboard URL:`, analyticsUrl);

  // 1. Switch language via hamburger → My Account → Language → Save
  ctx.languageChanged = true; // set before the switch so afterEach resets even if Save half-worked
  await tp.setLanguage(LANG);

  // 2. Capture every screen
  // (setLanguage re-opens My Account to verify the save, so go home for the home capture)
  const screens = {};
  await page.goto(tp.homeUrl);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  screens.home = normalizeTexts(await collectTexts(page.locator('body')), LANG);

  await tp.openAnalytics(analyticsUrl);
  screens.dashboard = normalizeTexts(await collectTexts(page.locator('body')), LANG);

  await tp.openReportsModal();
  screens.reportsNow = normalizeTexts(await collectTexts(tp.modal), LANG);

  await tp.selectSchedule();
  screens.reportsSchedule = normalizeTexts(await collectTexts(tp.modal), LANG);

  await tp.selectNow();
  const toast = await tp.sendNow(EMAIL, `Translation check ${LANG} (${ROLE})`);
  screens.sendNowToast = normalizeTexts([toast], LANG);

  // 3. Basic sanity: the UI really is translated
  if (LANG !== 'en') {
    const allText = Object.values(screens).flat().join('\n');
    for (const marker of ENGLISH_MARKERS) {
      expect.soft(allText.includes(marker), `English text "${marker}" still visible in ${LANG}`).toBe(false);
    }
  }
  for (const [name, texts] of Object.entries(screens)) {
    expect.soft(texts.length, `No text captured on ${name}`).toBeGreaterThan(0);
  }

  // 4. Save this run's capture for review
  const current = { language: LANG, languageName: LANGUAGES[LANG], env: ENV, role: ROLE, capturedAt: new Date().toISOString(), screens };
  const runFile = path.resolve('test-results/translations', LANG, `${ENV}-${ROLE}-${testInfo.project.name}.json`);
  saveJson(runFile, current);
  await testInfo.attach(`translations-${LANG}-${ROLE}.json`, { path: runFile, contentType: 'application/json' });

  // 5. Compare with the baseline, or create it
  const file = baselinePath(LANG, ENV, ROLE);
  const baseline = loadBaseline(file);

  if (!baseline || UPDATE) {
    saveJson(file, { ...current, createdAt: current.capturedAt });
    const msg = `${baseline ? 'Baseline updated' : 'Baseline created'}: ${path.relative(process.cwd(), file)} – review and commit it`;
    console.log(`📝 ${msg}`);
    testInfo.annotations.push({ type: 'translation-baseline', description: msg });
    return;
  }

  // A screen the baseline has never seen (newly added to the test) is added to the
  // baseline file instead of failing – it is reviewed like any new baseline.
  const newScreens = Object.keys(screens).filter(n => !(n in baseline.screens));
  if (newScreens.length) {
    newScreens.forEach(n => { baseline.screens[n] = screens[n]; });
    saveJson(file, { ...baseline, updatedAt: current.capturedAt });
    const msg = `New screen(s) added to ${path.relative(process.cwd(), file)}: ${newScreens.join(', ')} – review and commit`;
    console.log(`📝 ${msg}`);
    testInfo.annotations.push({ type: 'translation-baseline', description: msg });
  }

  let problems = 0;
  const warnings = [];
  for (const name of new Set([...Object.keys(baseline.screens), ...Object.keys(screens)])) {
    if (newScreens.includes(name)) continue;
    const diff = diffTexts(baseline.screens[name], screens[name]);
    // data-dependent wording (impact equivalents) → warning only
    const volatile = [...diff.missing, ...diff.added].filter(isVolatile);
    const missing = diff.missing.filter(t => !isVolatile(t));
    const added   = diff.added.filter(t => !isVolatile(t));
    if (volatile.length) {
      warnings.push(`${name}: ${volatile.join(' | ')}`);
      console.log(`~ ${name}: data-dependent text changed (not a failure):`);
      diff.missing.filter(isVolatile).forEach(t => console.log(`   ~ was: ${t}`));
      diff.added.filter(isVolatile).forEach(t => console.log(`   ~ now: ${t}`));
    }
    if (missing.length || added.length) {
      problems++;
      console.log(`\n✖ ${name}`);
      missing.forEach(t => console.log(`   - missing: ${t}`));
      added.forEach(t => console.log(`   + new:     ${t}`));
    } else {
      console.log(`✔ ${name}: ${(screens[name] || []).length} texts match`);
    }
    expect.soft({ missing, added }, `Translation differences on "${name}"`).toEqual({ missing: [], added: [] });
  }
  if (warnings.length) {
    testInfo.annotations.push({ type: 'translation-warning', description: `Data-dependent text changed – ${warnings.join('; ')}` });
  }
  if (!problems) console.log(`All ${LANG} translations match the baseline`);
}
