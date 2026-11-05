import { expect } from '@playwright/test';
import { queryDatabase } from '../utils/db.js';

// ═══════════════════════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════════════════════

export class LoginPage {
  constructor(page) {
    this.page = page;
    this.logo = page.getByRole('img', { name: 'waste-not-2.0-logo' });
    this.heading = page.getByText('LOG INTO WASTE NOT');
    this.emailInput = page.getByRole('textbox', { name: 'Login email' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.loginButton = page.getByRole('button', { name: 'Log in' });
  }

  async goto(url) {
    await this.page.goto(url);
  }

  async assertPageLoaded() {
    await expect(this.logo).toBeVisible();
    await expect(this.heading).toBeVisible();
  }

  async login(username, password) {
    await this.emailInput.pressSequentially(username, { delay: 100 });
    await this.passwordInput.pressSequentially(password, { delay: 100 });
    await this.loginButton.click();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════

export class DashboardPage {
  constructor(page) {
    this.page = page;
    this.analyticsDashboardBtn = page.getByRole('button', { name: 'Analytics Dashboard' });
    this.analyticsDashboardViewBtn = page.getByRole('button', { name: 'Analytics Dashboard View' });
    this.globalAdminLabel = page.getByText('GLOBAL ADMIN', { exact: true });
    this.selectUnitBtn = page.getByRole('button', { name: 'Select a Unit' });
    this.unitSearchInput = page.getByRole('textbox', { name: 'Search' });
    this.applyBtn = page.getByText('Apply');
    this.imperialRadio = page.getByRole('radio', { name: 'Imperial' });
    this.chartLabels = page.locator('.highcharts-axis-labels span');
  }

  async navigateToDashboard({ isGlobalAdmin = false } = {}) {
    await this.page.waitForTimeout(5000);
    if (isGlobalAdmin) {
      await expect(this.globalAdminLabel).toBeVisible();
      await this.analyticsDashboardViewBtn.click();
    } else {
      await this.analyticsDashboardBtn.click();
    }
    await this.page.waitForTimeout(8000);
  }

  async selectUnit(unitName) {
    await this.selectUnitBtn.click();
    await this.unitSearchInput.pressSequentially(unitName, { delay: 100 });
    await this.page.getByText(unitName).click();
    await this.applyBtn.click();
  }

  async selectImperial() {
    await this.imperialRadio.check();
    await this.page.waitForTimeout(2000);
  }

  // Used by UnitAdmin – unit name/number is read directly from the UI
  async getUnitDetailsFromUI() {
    const element = this.page.getByText(/\(\d+\)/).first();
    await element.waitFor({ state: 'visible' });
    const text = await element.innerText();
    const match = text.match(/^(.*?)\s*\((\d+)\)$/);
    return {
      unitName: match ? match[1].trim() : '',
      idNumber: match ? match[2] : ''
    };
  }

  async checkValueInChartLabels(expectedValue) {
    await this.chartLabels.first().waitFor({ timeout: 10000 });
    let labels = await this.chartLabels.allTextContents();
    labels = labels.map(l => l.replace(/\s+/g, ' ').trim());
    return labels.some(l => l.includes(expectedValue.toString()));
  }

  async assertChartValues(dbValues) {
    for (const [label, value] of Object.entries(dbValues)) {
      if (value) {
        const exists = await this.checkValueInChartLabels(value);
        if (exists) {
          console.log(`${label} verified in UI: ${value} lbs`);
        } else {
          console.warn(`${label} (${value} lbs) not visible in UI`);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  REPORTS PAGE
// ═══════════════════════════════════════════════════════════════

export class ReportsPage {
  constructor(page) {
    this.page = page;
    this.reportsBtn = page.getByRole('button', { name: 'REPORTS', exact: true });
    this.toTextbox = page.getByRole('textbox', { name: 'To*' });
    this.subjectTextbox = page.locator('textarea[name="subject"]');
    // "When*" dropdown in the Reports modal: toggle shows the current value,
    // menu items are <a role="button"> "now" / "schedule"
    this.whenDropdown = page.locator('.dropdown-container').filter({ has: page.locator('.dropdown-label', { hasText: 'When*' }) });
    this.whenToggle = this.whenDropdown.locator('.dropdown-toggle');
    this.whenMenu = this.whenDropdown.locator('.dropdown-menu.show');
    this.nowBtn = this.whenToggle; // kept for backwards compatibility
    this.scheduleBtn = this.whenMenu.getByRole('button', { name: 'schedule', exact: true });
    this.everydayRadio = page.getByRole('radio', { name: 'Everyday' });
    this.weeklyRadio = page.getByRole('radio', { name: 'Weekly' });
    this.sendNowBtn = page.getByRole('button', { name: 'Send Now' });
    this.alert = page.getByRole('alert');

    // Collect browser-side errors so an app crash (blank page) is reported clearly
    this.pageErrors = [];
    page.on('pageerror', err => this.pageErrors.push(`pageerror: ${err.message}`));
    page.on('console', msg => { if (msg.type() === 'error') this.pageErrors.push(`console.error: ${msg.text()}`); });
    page.on('response', res => { if (res.status() >= 400) this.pageErrors.push(`HTTP ${res.status()}: ${res.request().method()} ${res.url()}`); });
  }

  // True when the app has unmounted (white screen) – Reports button is always present otherwise
  async isAppCrashed() {
    return !(await this.reportsBtn.isVisible());
  }

  async failIfAppCrashed(context) {
    await this.page.waitForTimeout(1500);
    if (await this.isAppCrashed()) {
      await this.page.screenshot({ path: 'schedule-form-failure.png', fullPage: true }).catch(() => {});
      const errors = this.pageErrors.length ? this.pageErrors.join('\n  ') : '(no JS errors captured)';
      throw new Error(`App crashed / blank page after ${context}. Browser errors:\n  ${errors}`);
    }
  }

  async fillSubject(subjectText) {
    await expect(this.subjectTextbox).toBeVisible();
    await this.subjectTextbox.click();
    await this.subjectTextbox.fill('');
    await this.subjectTextbox.fill(subjectText);
    await expect(this.subjectTextbox).toHaveValue(subjectText);
  }

  // Waits for the Schedule form to actually render after clicking "schedule".
  // On retry it re-drives the toggle from whatever state the panel is in,
  // with short timeouts so a missing element fails fast instead of eating the test timeout.
  async waitForScheduleForm(retries = 3) {
    const formVisible = this.everydayRadio.or(this.weeklyRadio).first();
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await formVisible.waitFor({ state: 'visible', timeout: 10000 });
        return;
      } catch {
        console.warn(`Schedule form not visible (attempt ${attempt}/${retries})`);
        await this.failIfAppCrashed('clicking "schedule"');
        if (attempt === retries) {
          await this.page.screenshot({ path: 'schedule-form-failure.png', fullPage: true }).catch(() => {});
          console.log('ARIA SNAPSHOT:\n' + await this.page.locator('body').ariaSnapshot().catch(() => 'n/a'));
          throw new Error('Schedule form did not render after multiple attempts (see schedule-form-failure.png)');
        }
        await this.reopenSchedule();
      }
    }
  }

  // Opens the When* dropdown and picks an option, then confirms the toggle shows it.
  async selectWhen(option) {
    await this.whenToggle.waitFor({ state: 'visible', timeout: 10000 });
    if ((await this.whenToggle.innerText()).trim() === option) return;
    await this.whenToggle.click();
    const item = this.whenMenu.getByRole('button', { name: option, exact: true });
    await item.waitFor({ state: 'visible', timeout: 5000 });
    await item.click();
    await this.failIfAppCrashed(`selecting "${option}" in When* dropdown`);
    await expect(this.whenToggle).toHaveText(option, { timeout: 5000 });
  }

  // Retry path: re-select "schedule" if the modal is still there
  async reopenSchedule() {
    if (await this.whenToggle.isVisible()) {
      await this.selectWhen('now');
      await this.selectWhen('schedule');
      return;
    }
    console.warn('When* dropdown not found, reopening Reports panel');
    await this.openReportsModal();
    await this.selectWhen('schedule');
  }

  // Clicks REPORTS and waits for the modal's /timezones request to finish.
  // The schedule form crashes (pa.find on undefined) if "schedule" is picked before timezones load.
  async openReportsModal() {
    const timezonesLoaded = this.page.waitForResponse(
      res => res.url().includes('/timezones') && res.ok(),
      { timeout: 20000 }
    ).catch(() => console.warn('timezones response not seen within 20s, continuing'));
    await this.reportsBtn.waitFor({ state: 'visible' });
    await this.reportsBtn.click();
    await expect(this.toTextbox).toBeVisible();
    await expect(this.whenToggle).toBeVisible();
    await timezonesLoaded;
  }

  async openAndFillEmail(emailId) {
    await this.openReportsModal();
    await this.toTextbox.click();
    await this.toTextbox.fill('');
    await this.toTextbox.fill(emailId);

    await this.selectWhen('schedule');

    await this.waitForScheduleForm();
  }

  async selectEveryday() {
    await this.everydayRadio.waitFor({ state: 'visible', timeout: 10000 });
    await this.everydayRadio.check();
  }

  async selectWeekly(day) {
    await this.weeklyRadio.waitFor({ state: 'visible', timeout: 10000 });
    await this.weeklyRadio.check();

    const recurDropdown = this.page.locator('div')
      .filter({ hasText: /^Recur Every Week\(s\)Select one day of the week$/ })
      .locator('i').nth(1);
    await recurDropdown.waitFor({ state: 'visible', timeout: 10000 });
    await recurDropdown.click();

    const dropdownBtn = this.page.getByRole('button').filter({ hasText: /^$/ });
    await dropdownBtn.first().click();

    const oneOption = this.page.getByRole('button', { name: '1', exact: true });
    await oneOption.waitFor({ state: 'visible', timeout: 10000 });
    await oneOption.click();

    const dayRadio = this.page.getByRole('radio', { name: day });
    await dayRadio.waitFor({ state: 'visible', timeout: 10000 });
    await dayRadio.check();
  }

  async selectTimezone(zone) {
    const timezoneDropdown = this.page.getByRole('button', { name: 'Select a timezone' });
    await timezoneDropdown.waitFor({ state: 'visible', timeout: 10000 });
    await timezoneDropdown.click();
    const zoneOption = this.page.getByRole('button', { name: zone });
    await zoneOption.waitFor({ state: 'visible', timeout: 10000 });
    await zoneOption.click();
  }

  async createSchedule() {
    const createBtn = this.page.getByRole('button', { name: 'Create' }).nth(1);
    await createBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createBtn.click();
    await expect(this.alert).toBeVisible();
    console.log('Toast/Alert Message:', await this.alert.innerText());
  }

  async createAllSchedules(emailId, schedules) {
    for (const schedule of schedules) {
      await this.openAndFillEmail(emailId);
      if (schedule.type === 'Everyday') await this.selectEveryday();
      if (schedule.type === 'Weekly') await this.selectWeekly(schedule.day);
      await this.selectTimezone(schedule.timezone);
      await this.fillSubject('Scheduled Report via Automation');
      await this.createSchedule();
    }
  }

  async sendNow(emailId) {
    await this.openReportsModal();
    await this.toTextbox.click();
    await this.toTextbox.fill('');
    await this.toTextbox.fill(emailId);

    await this.fillSubject('NOW Report via Automation');

    await this.sendNowBtn.waitFor({ state: 'visible' });
    await this.sendNowBtn.click();
    await expect(this.alert).toBeVisible();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATE HELPER
// ═══════════════════════════════════════════════════════════════

function formatDate(date, isEnd = false) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} ${isEnd ? '23:59:59' : '00:00:00'}`;
}

export function getDashboardDateRanges() {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const past6MonthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const past6MonthsEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);

  return {
    currentMonthStartDate: formatDate(currentMonthStart),
    currentMonthEndDate: formatDate(currentMonthEnd, true),
    past6MonthsStartDate: formatDate(past6MonthsStart),
    past6MonthsEndDate: formatDate(past6MonthsEnd, true),
    lastYearStartDate: formatDate(lastYearStart),
    lastYearEndDate: formatDate(lastYearEnd, true),
  };
}

// ═══════════════════════════════════════════════════════════════
//  DB HELPERS
// ═══════════════════════════════════════════════════════════════

export async function getEntityUnitId(unitName, dbConfig) {
  const result = await queryDatabase(
    `SELECT id FROM entity_units WHERE name = '${unitName}' LIMIT 1;`,
    dbConfig
  );
  const id = result[0]?.id;
  if (!id) throw new Error(`Entity Unit ID not found for unit: ${unitName}`);
  console.log(`Entity Unit ID for "${unitName}": ${id}`);
  return id;
}

export async function getEntityUnitIdByNumber(unitName, idNumber, dbConfig) {
  const result = await queryDatabase(
    `SELECT id FROM entity_units WHERE name = '${unitName}' AND id_number = '${idNumber}' LIMIT 1;`,
    dbConfig
  );
  const id = result[0]?.id;
  if (!id) throw new Error(`Entity Unit ID not found for unit: ${unitName} (${idNumber})`);
  console.log(`Entity Unit ID for "${unitName}" (${idNumber}): ${id}`);
  return id;
}

export async function getEntityUnitIdCaseInsensitive(unitName, idNumber, dbConfig) {
  const safe = unitName.replace(/'/g, "''");
  const result = await queryDatabase(
    `SELECT id FROM entity_units WHERE LOWER(name) = LOWER('${safe}') AND id_number = '${idNumber}' LIMIT 1;`,
    dbConfig
  );
  const id = result[0]?.id;
  if (!id) throw new Error(`Entity Unit ID not found for unit: ${unitName} (${idNumber})`);
  console.log(`Entity Unit ID for "${unitName}" (${idNumber}): ${id}`);
  return id;
}

export async function fetchDashboardMetrics(entityUnitId, dateRanges, dbConfig) {
  const {
    currentMonthStartDate, currentMonthEndDate,
    past6MonthsStartDate, past6MonthsEndDate,
    lastYearStartDate, lastYearEndDate,
  } = dateRanges;

  const currentMonthQuery = `
    SELECT
      SUM(calculated_amount) AS total_calculated_amount,
      COUNT(DISTINCT DATE(created_date_gmt)) AS total_days,
      SUM(calculated_amount) / COUNT(DISTINCT DATE(created_date_gmt)) AS avg_lbs_per_day
    FROM waste_records
    WHERE kind_of_waste != 5
      AND created_date_gmt BETWEEN '${currentMonthStartDate}' AND '${currentMonthEndDate}'
      AND entity_unit_id = ${entityUnitId};
  `;

  const past6MonthsQuery = `
    WITH MonthlyData AS (
      SELECT
        EXTRACT(YEAR  FROM created_date_gmt) AS year,
        EXTRACT(MONTH FROM created_date_gmt) AS month,
        DATE(created_date_gmt)               AS day,
        calculated_amount
      FROM waste_records
      WHERE kind_of_waste != 5
        AND created_date_gmt BETWEEN '${past6MonthsStartDate}' AND '${past6MonthsEndDate}'
        AND entity_unit_id = ${entityUnitId}
    ),
    MonthlyAverages AS (
      SELECT
        year, month,
        SUM(calculated_amount)                               AS total_calculated_amount,
        COUNT(DISTINCT day)                                  AS total_days,
        SUM(calculated_amount) / COUNT(DISTINCT day)         AS avg_lbs_per_day
      FROM MonthlyData
      GROUP BY year, month
      HAVING COUNT(DISTINCT day) >= 12
    )
    SELECT *, (SELECT AVG(avg_lbs_per_day) FROM MonthlyAverages) AS overall_avg_lbs_per_day
    FROM MonthlyAverages;
  `;

  const lastYearQuery = `
    SELECT
      SUM(calculated_amount) AS total_calculated_amount,
      COUNT(DISTINCT DATE(created_date_gmt)) AS total_days,
      SUM(calculated_amount) / COUNT(DISTINCT DATE(created_date_gmt)) AS avg_lbs_per_day
    FROM waste_records
    WHERE kind_of_waste != 5
      AND created_date_gmt BETWEEN '${lastYearStartDate}' AND '${lastYearEndDate}'
      AND entity_unit_id = ${entityUnitId};
  `;

  const [past6MonthsResult, currentMonthResult, lastYearResult] = await Promise.all([
    queryDatabase(past6MonthsQuery, dbConfig),
    queryDatabase(currentMonthQuery, dbConfig),
    queryDatabase(lastYearQuery, dbConfig),
  ]);

  console.log('DB Results:', { past6MonthsResult, currentMonthResult, lastYearResult });

  const dbPast6Months = Math.round(past6MonthsResult[0]?.overall_avg_lbs_per_day || 0);
  const dbCurrentMonth = Math.round(currentMonthResult[0]?.avg_lbs_per_day || 0);
  const dbLastYear = Math.round(lastYearResult[0]?.avg_lbs_per_day || 0);

  console.log(`Processed Values → Past6Months: ${dbPast6Months}, CurrentMonth: ${dbCurrentMonth}, LastYear: ${dbLastYear}`);

  return {
    'Past 6 Months': dbPast6Months,
    'Current Month': dbCurrentMonth,
    'Last Year': dbLastYear,
  };
}