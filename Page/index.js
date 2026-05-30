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
    this.nowBtn = page.getByRole('button', { name: 'now', exact: true });
    this.scheduleBtn = page.getByRole('button', { name: 'schedule', exact: true });
    this.everydayRadio = page.getByRole('radio', { name: 'Everyday' });
    this.weeklyRadio = page.getByRole('radio', { name: 'Weekly' });
    this.sendNowBtn = page.getByRole('button', { name: 'Send Now' });
    this.alert = page.getByRole('alert');
  }

  async openAndFillEmail(emailId) {
    await this.reportsBtn.waitFor({ state: 'visible' });
    await this.reportsBtn.click();
    await expect(this.toTextbox).toBeVisible();
    await this.toTextbox.click();
    await this.toTextbox.fill('');
    await this.toTextbox.fill(emailId);
    await this.nowBtn.waitFor({ state: 'visible' });
    await this.nowBtn.click();
    await this.scheduleBtn.waitFor({ state: 'visible' });
    await this.scheduleBtn.click();
  }

  async selectEveryday() {
    await this.everydayRadio.waitFor({ state: 'visible' });
    await this.everydayRadio.check();
  }

  async selectWeekly(day) {
    await this.weeklyRadio.waitFor({ state: 'visible' });
    await this.weeklyRadio.check();

    const recurDropdown = this.page.locator('div')
      .filter({ hasText: /^Recur Every Week\(s\)Select one day of the week$/ })
      .locator('i').nth(1);
    await recurDropdown.waitFor({ state: 'visible' });
    await recurDropdown.click();

    const dropdownBtn = this.page.getByRole('button').filter({ hasText: /^$/ });
    await dropdownBtn.first().click();

    const oneOption = this.page.getByRole('button', { name: '1', exact: true });
    await oneOption.waitFor({ state: 'visible' });
    await oneOption.click();

    const dayRadio = this.page.getByRole('radio', { name: day });
    await dayRadio.waitFor({ state: 'visible' });
    await dayRadio.check();
  }

  async selectTimezone(zone) {
    const timezoneDropdown = this.page.getByRole('button', { name: 'Select a timezone' });
    await timezoneDropdown.waitFor({ state: 'visible' });
    await timezoneDropdown.click();
    const zoneOption = this.page.getByRole('button', { name: zone });
    await zoneOption.waitFor({ state: 'visible' });
    await zoneOption.click();
  }

  async createSchedule() {
    const createBtn = this.page.getByRole('button', { name: 'Create' }).nth(1);
    await createBtn.waitFor({ state: 'visible' });
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
      await this.createSchedule();
    }
  }

  async sendNow(emailId) {
    await this.reportsBtn.waitFor({ state: 'visible' });
    await this.reportsBtn.click();
    await expect(this.toTextbox).toBeVisible();
    await this.toTextbox.click();
    await this.toTextbox.fill('');
    await this.toTextbox.fill(emailId);
    await this.sendNowBtn.waitFor({ state: 'visible' });
    await this.sendNowBtn.click();
    await expect(this.alert).toBeVisible();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATE HELPER
// ═══════════════════════════════════════════════════════════════

function formatDate(date, isEnd = false) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} ${isEnd ? '23:59:59' : '00:00:00'}`;
}

export function getDashboardDateRanges() {
  const now = new Date();
  const currentMonthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd    = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const past6MonthsStart   = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const past6MonthsEnd     = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastYearStart      = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lastYearEnd        = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);

  return {
    currentMonthStartDate : formatDate(currentMonthStart),
    currentMonthEndDate   : formatDate(currentMonthEnd, true),
    past6MonthsStartDate  : formatDate(past6MonthsStart),
    past6MonthsEndDate    : formatDate(past6MonthsEnd, true),
    lastYearStartDate     : formatDate(lastYearStart),
    lastYearEndDate       : formatDate(lastYearEnd, true),
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
    past6MonthsStartDate,  past6MonthsEndDate,
    lastYearStartDate,     lastYearEndDate,
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

  const dbPast6Months  = Math.round(past6MonthsResult[0]?.overall_avg_lbs_per_day || 0);
  const dbCurrentMonth = Math.round(currentMonthResult[0]?.avg_lbs_per_day || 0);
  const dbLastYear     = Math.round(lastYearResult[0]?.avg_lbs_per_day || 0);

  console.log(`Processed Values → Past6Months: ${dbPast6Months}, CurrentMonth: ${dbCurrentMonth}, LastYear: ${dbLastYear}`);

  return {
    'Past 6 Months': dbPast6Months,
    'Current Month': dbCurrentMonth,
    'Last Year':     dbLastYear,
  };
}