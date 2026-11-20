// utils/compassFlow.js
// The Compass UI test flow, run as one admin. Shared by CompassDevPOM / CompassStagPOM / CompassProdPOM.

import { test } from '@playwright/test';
import { CompassPage } from '../Page/CompassPage.js';
import { buildDateRanges, runWasteQueries } from './bamcoHelpers.js';

/**
 * @param {object} o
 * @param {import('@playwright/test').Page} o.page
 * @param {{ key, label, loginId, password, mfaHint, otp, complexId }} o.admin  from getCompassAdmins()
 * @param {string} o.url              Compass URL for this environment
 * @param {object} o.dbConfig         DB config for this environment
 * @param {string} o.nowSubject       subject for the Send Now report
 * @param {string} o.scheduleSubject  subject for the scheduled report
 * @param {string} o.reportEmail      who receives the reports
 */
export async function runCompassFlow({ page, admin, url, dbConfig, nowSubject, scheduleSubject, reportEmail }) {
  if (!url) throw new Error('Compass URL is missing in .env for this environment');
  if (!admin.password) throw new Error(`No password for ${admin.key} – set COMPASS_${admin.key.toUpperCase()}_PASSWORD or WASTENOT_PASSWORD`);

  test.info().annotations.push({ type: 'admin', description: `${admin.label} (${admin.key})` });
  const what = { dashboard: 'login + dashboard only', login: 'login + tracking calendar + waste trend', calendar: 'login + tracking calendar + waste trend + cost center', full: `full flow on complex ${admin.complexId}` };
  console.log(`👤 Running as ${admin.label} [${admin.key}] – ${what[admin.mode]}`);

  const compass = new CompassPage(page);

  // ── 1. Login ────────────────────────────────────────────────
  await compass.goto(url, admin.loginId);
  await compass.submitLoginAndEnterPassword(admin.password);

  if (process.env.DEBUG_MFA === 'true') await page.pause();

  await compass.handleMfa(admin.mfaHint);
  await compass.handleOtp(admin.otp);
  await compass.dismissStaySignedIn();

  // Dashboard admins: login + dashboard reached, then stop (used while an account's access isn't known yet)
  if (admin.mode === 'dashboard') {
    await compass.assertLoggedIn(admin.expectText);
    const scope = (await compass.hasComplexFilter())
      ? `Complex filter: ${await compass.filterValue('Complex')}`
      : 'no Complex filter (complex-level access)';
    console.log(`✅ ${admin.label} logged in and reached the dashboard – ${scope}`);
    return;
  }

  // Login admins: dashboard reached + tracking calendar + waste trend, then stop (no cost center step)
  if (admin.mode === 'login') {
    await compass.assertLoggedIn(admin.expectText);
    console.log(`✅ ${admin.label} logged in and reached the dashboard`);
    // Complex-level admins have a complex on login; others use COMPLEX_ID, or the first complex they can see
    await checkTrackingCalendar(compass, admin);
    await compass.checkCalendarPreviousMonth();
    await validateWasteTrend({ compass, page, admin, dbConfig });
    return;
  }

  // Calendar admins: tracking calendar + waste trend + a cost center with a full hierarchy, then stop
  if (admin.mode === 'calendar') {
    await compass.assertLoggedIn(admin.expectText);
    await checkTrackingCalendar(compass, admin);
    await compass.checkCalendarPreviousMonth();
    await validateWasteTrend({ compass, page, admin, dbConfig });
    await compass.selectCostCenterWithKitchen({ resetScope: () => checkTrackingCalendar(compass, admin) });
    return;
  }

  // ── 2. Assert dashboard loaded ───────────────────────────────
  await compass.assertDashboardVisible();
  await compass.assertIframeElementsVisible();

  // ── 3. Select complex → tracking calendar appears, ‹ previous month works ─
  await checkTrackingCalendar(compass, admin);
  await compass.checkCalendarPreviousMonth();

  // ── 4–6. Waste trend section: UI vs DB lbs ───────────────────
  await validateWasteTrend({ compass, page, admin, dbConfig });

  // ── 7. Send Now report ───────────────────────────────────────
  await compass.sendNowReport([reportEmail], nowSubject);

  // ── 8. Schedule report ───────────────────────────────────────
  await compass.scheduleReport({
    email     : reportEmail,
    frequency : 'Daily',
    dateRange : 'Fiscal Month to Date',
    subject   : scheduleSubject,
  });

  // ── 9. Cost center with a kitchen set up → tracking calendar ─
  // Reload to close the report modal; the complex is re-selected if the reload cleared it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await compass.assertLoggedIn();
  await checkTrackingCalendar(compass, admin);
  await compass.selectCostCenterWithKitchen({ resetScope: () => checkTrackingCalendar(compass, admin) });
}

/**
 * Waste Trend section: headings visible, then Past 6 Months / Current Month / Last Year lbs in the UI
 * compared with the DB for the admin's complex.
 * The DB side needs the complex code, so admins without their own COMPLEX_ID (login/calendar modes)
 * only get the "section is shown" check.
 */
async function validateWasteTrend({ compass, page, admin, dbConfig }) {
  if (admin.mode !== 'full' && !admin.wasteTrend) {
    console.log(`Waste Trend check turned off for ${admin.key} (COMPASS_${admin.key.toUpperCase()}_WASTE_TREND=false)`);
    return;
  }
  await compass.assertWasteSectionVisible();

  if (admin.mode !== 'full' && !admin.complexIdSet) {
    console.warn(`⚠️ Waste Trend shown – DB comparison skipped for ${admin.key}: set COMPASS_${admin.key.toUpperCase()}_COMPLEX_ID=C-xxxxx (its complex code) to enable it`);
    return;
  }

  const dates = buildDateRanges({ useYesterdayAsCurrentEnd: true });
  console.log(dates);

  const { dbPast6Months, dbCurrentMonth, dbLastYear } =
    await runWasteQueries(admin.complexId, dates, dbConfig);

  await page.waitForTimeout(5000);
  await compass.assertIframeLbsValue(dbPast6Months,  'Past 6 Months');
  await compass.assertIframeLbsValue(dbCurrentMonth, 'Current Month', true);
  await compass.assertIframeLbsValue(dbLastYear,     'Last Year');
}

/**
 * Puts the dashboard on the admin's complex: selects it when the admin has a Complex filter
 * (re-uses it if already selected); complex-level admins are already scoped to theirs.
 */
async function ensureComplexScope(compass, admin) {
  if (!(await compass.hasComplexFilter())) return false; // complex-level access – nothing to select
  const current = await compass.filterValue('Complex');
  if (/^All Complexes$/i.test(current) || !current) {
    await compass.assertManageSettingsHidden('before a complex is selected');
    if (admin.complexIdSet || admin.mode === 'full') {
      await compass.selectComplex(admin.complexId);
    } else {
      // access not configured: take the first complex this admin can see, and use its code for the DB checks
      const picked = await compass.selectFirstAvailableComplex();
      admin.complexId = picked.code;
      admin.complexIdSet = true;
    }
  } else {
    console.log(`Complex already selected: ${current}`);
  }
  return true;
}

/**
 * Complex-level admins see the tracking calendar straight after login.
 * Admins with a Complex filter see it once a complex is selected.
 */
async function checkTrackingCalendar(compass, admin) {
  const selected = await ensureComplexScope(compass, admin);
  const context = selected ? `after selecting complex ${admin.complexId}` : 'on login (complex-level access)';
  await compass.assertTrackingCalendarVisible(context);
  await compass.assertManageSettingsVisible(context);
}
