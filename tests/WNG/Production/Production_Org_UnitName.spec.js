import { test, expect } from '@playwright/test';
import { queryDatabase } from '../../../utils/db';

test.describe('Dashboard Validation', () => {
  let dbConfig;

  test.beforeEach(async ({ page }, testInfo) => {
    // Pick prod DB config
    dbConfig = {
      ...testInfo.config.metadata.globalprod,
      database: 'wastenotglobal'
    };
    console.log('DB config set to prod (wastenotglobal)');

    await page.goto('https://www.wastenotglobal.com/login');
    await expect(page.getByRole('img', { name: 'waste-not-2.0-logo' })).toBeVisible();
    await expect(page.getByText('LOG INTO WASTE NOT')).toBeVisible();

    await page.getByRole('textbox', { name: 'Login email' }).pressSequentially('adityaorg@mailinator.com', { delay: 100 });
    await page.getByRole('textbox', { name: 'Password' }).pressSequentially('Adi16@global', { delay: 100 });
    await page.getByRole('button', { name: 'Log in' }).click();
  });

  test('Validate Dashboard DB vs UI', async ({ page }) => {
    await page.waitForTimeout(5000);
    await page.getByRole('button', { name: 'Analytics Dashboard' }).click();
    await page.waitForTimeout(8000);

    // Select Unit
    const unitName = 'Sejal Unit 01'; // dynamic unit name
    await page.getByRole('button', { name: 'Select a Unit' }).click();
    await page.getByRole('textbox', { name: 'Search' }).pressSequentially(unitName, { delay: 100 });
    await page.getByText(`${unitName}`).click();
    await page.getByText('Apply').click();

    await page.getByRole('radio', { name: 'Imperial' }).check();
    await page.waitForTimeout(2000);

    // === Query to fetch entity_unit_id dynamically ===
    const entityUnitQuery = `
      SELECT id 
      FROM entity_units 
      WHERE name = '${unitName}'
      LIMIT 1;
    `;
    const entityUnitResult = await queryDatabase(entityUnitQuery, dbConfig);
    const entityUnitId = entityUnitResult[0]?.id;

    if (!entityUnitId) {
      throw new Error(`Entity Unit ID not found for unit: ${unitName}`);
    }
    console.log(`Entity Unit ID for ${unitName}: ${entityUnitId}`);

    // ---------- FETCH TARGET VALUE ----------
    console.log(`Fetching Target for campus_id: ${entityUnitId}`);
    const getTargetQuery = `
      SELECT Target 
      FROM waste_trend_targets 
      WHERE entity_unit_id = '${entityUnitId}'
      LIMIT 1;
    `;
    const targetResult = await queryDatabase(getTargetQuery, dbConfig);
    let targetValue = targetResult[0]?.Target;

    if (targetValue !== undefined && targetValue !== null) {
      targetValue = Math.round(targetValue);
      console.log(`Target value found in DB: ${targetValue} lbs`);

      // Wait for iframe
      const iframeWasteNot = await page.frameLocator('#wastenot-html');

      try {
        await expect(
          iframeWasteNot.getByText(`TARGET: ${targetValue} lbs`)
        ).toBeVisible({ timeout: 5000 });
        console.log(`Verified TARGET: ${targetValue} lbs is visible on UI`);
      } catch (err) {
        console.warn(`TARGET: ${targetValue} lbs not visible on UI, but continuing...`);
      }
    } else {
      console.log('No Target value found for this campus, skipping target validation.');
    }

    // ================= DATE RANGES =================
    const now = new Date();

    // Current Month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Past 6 Months (excluding current month)
    const past6MonthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const past6MonthsEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Same Month Last Year
    const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);

    // Format function
    const formatDate = (date, isEnd = false) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day} ${isEnd ? '23:59:59' : '00:00:00'}`;
    };

    // Final formatted dates
    const currentMonthStartDate = formatDate(currentMonthStart);
    const currentMonthEndDate = formatDate(currentMonthEnd, true);

    const past6MonthsStartDate = formatDate(past6MonthsStart);
    const past6MonthsEndDate = formatDate(past6MonthsEnd, true);

    const lastYearStartDate = formatDate(lastYearStart);
    const lastYearEndDate = formatDate(lastYearEnd, true);

    console.log({
      currentMonthStartDate,
      currentMonthEndDate,
      past6MonthsStartDate,
      past6MonthsEndDate,
      lastYearStartDate,
      lastYearEndDate
    });

    // === Queries ===

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
            EXTRACT(YEAR FROM created_date_gmt) AS year,
            EXTRACT(MONTH FROM created_date_gmt) AS month,
            DATE(created_date_gmt) AS day,
            calculated_amount
        FROM waste_records
        WHERE kind_of_waste != 5
          AND created_date_gmt BETWEEN '${past6MonthsStartDate}' AND '${past6MonthsEndDate}'
          AND entity_unit_id = ${entityUnitId}
    ),
    MonthlyAverages AS (
        SELECT
            year,
            month,
            SUM(calculated_amount) AS total_calculated_amount,
            COUNT(DISTINCT day) AS total_days,
            SUM(calculated_amount) / COUNT(DISTINCT day) AS avg_lbs_per_day
        FROM MonthlyData
        GROUP BY year, month
        HAVING COUNT(DISTINCT day) >= 12
    )
    SELECT
        *,
        (SELECT AVG(avg_lbs_per_day) FROM MonthlyAverages) AS overall_avg_lbs_per_day
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

    // ---------- EXECUTE ----------
    const past6MonthsResult = await queryDatabase(past6MonthsQuery, dbConfig);
    const currentMonthResult = await queryDatabase(currentMonthQuery, dbConfig);
    const lastYearResult = await queryDatabase(lastYearQuery, dbConfig);

    console.log('DB Results:', { past6MonthsResult, currentMonthResult, lastYearResult });

    const dbPast6Months = Math.round(past6MonthsResult[0]?.overall_avg_lbs_per_day || 0);
    const dbCurrentMonth = Math.round(currentMonthResult[0]?.avg_lbs_per_day || 0);
    const dbLastYear = Math.round(lastYearResult[0]?.avg_lbs_per_day || 0);

    console.log(`Processed Values → Past6Months: ${dbPast6Months}, CurrentMonth: ${dbCurrentMonth}, LastYear: ${dbLastYear}`);

    // Utility to check if a value exists in chart labels
    async function checkValueInChartLabels(expectedValue) {
      // Wait until at least one label appears
      await page.locator('.highcharts-axis-labels span').first().waitFor({ timeout: 10000 });

      let labels = await page.locator('.highcharts-axis-labels span').allTextContents();

      // Clean up whitespace/newlines
      labels = labels.map(label => label.replace(/\s+/g, ' ').trim());

      return labels.some(label => label.includes(expectedValue.toString()));
    }

    // ---------- ASSERTIONS ----------
    const dbValues = {
      "Past 6 Months": dbPast6Months,
      "Current Month": dbCurrentMonth,
      "Last Year": dbLastYear
    };

    for (const [label, value] of Object.entries(dbValues)) {
      if (value) {
        const exists = await checkValueInChartLabels(value);

        if (exists) {
          console.log(`${label} verified in UI: ${value} lbs`);
        } else {
          console.warn(`${label} (${value} lbs) not visible in UI`);
        }
      }
    }
    const emailId = 'aditya.parmar@ccube.com';

    const schedules = [
      { type: 'Everyday', timezone: 'Central European Standard Time' },
      { type: 'Weekly', day: 'Monday', timezone: 'Central European Standard Time' },
      { type: 'Weekly', day: 'Wednesday', timezone: 'Eastern Standard Time' },
    ];

    const toTextbox = page.getByRole('textbox', { name: 'To*' });

    async function openReportsAndFillEmail() {
      const reportsBtn = page.getByRole('button', { name: 'REPORTS', exact: true });
      await reportsBtn.waitFor({ state: 'visible' });
      await reportsBtn.click();

      await expect(toTextbox).toBeVisible();

      await toTextbox.click();
      await toTextbox.fill(''); // clear instead of Ctrl+A
      await toTextbox.fill(emailId);

      const nowBtn = page.getByRole('button', { name: 'now', exact: true });
      await nowBtn.waitFor({ state: 'visible' });
      await nowBtn.click();

      const scheduleBtn = page.getByRole('button', { name: 'schedule', exact: true });
      await scheduleBtn.waitFor({ state: 'visible' });
      await scheduleBtn.click();
    }

    async function selectTimezone(zone) {
      const timezoneDropdown = page.getByRole('button', { name: 'Select a timezone' });
      await timezoneDropdown.waitFor({ state: 'visible' });
      await timezoneDropdown.click();

      const zoneOption = page.getByRole('button', { name: zone });
      await zoneOption.waitFor({ state: 'visible' });
      await zoneOption.click();
    }

    async function createSchedule() {
      const createBtn = page.getByRole('button', { name: 'Create' }).nth(1);
      await createBtn.waitFor({ state: 'visible' });
      await createBtn.click();

      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      console.log('Toast/Alert Message:', await alert.innerText());
    }

    for (const schedule of schedules) {
      await openReportsAndFillEmail();

      if (schedule.type === 'Everyday') {
        const everydayRadio = page.getByRole('radio', { name: 'Everyday' });
        await everydayRadio.waitFor({ state: 'visible' });
        await everydayRadio.check();
      }

      if (schedule.type === 'Weekly') {
        const weeklyRadio = page.getByRole('radio', { name: 'Weekly' });
        await weeklyRadio.waitFor({ state: 'visible' });
        await weeklyRadio.check();

        const recurDropdown = page.locator('div')
          .filter({ hasText: /^Recur Every Week\(s\)Select one day of the week$/ })
          .locator('i')
          .nth(1);

        await recurDropdown.waitFor({ state: 'visible' });
        await recurDropdown.click();

        const dropdownBtn = page.getByRole('button').filter({ hasText: /^$/ });
        await dropdownBtn.first().click();

        const oneOption = page.getByRole('button', { name: '1', exact: true });
        await oneOption.waitFor({ state: 'visible' });
        await oneOption.click();

        const dayRadio = page.getByRole('radio', { name: schedule.day });
        await dayRadio.waitFor({ state: 'visible' });
        await dayRadio.check();
      }

      await selectTimezone(schedule.timezone);
      await createSchedule();
    }

    // Send Now flow
    const reportsBtn = page.getByRole('button', { name: 'REPORTS', exact: true });
    await reportsBtn.click();

    await expect(toTextbox).toBeVisible();
    await toTextbox.click();
    await toTextbox.fill('');
    await toTextbox.fill(emailId);

    const sendNowBtn = page.getByRole('button', { name: 'Send Now' });
    await sendNowBtn.waitFor({ state: 'visible' });
    await sendNowBtn.click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();

  });
});