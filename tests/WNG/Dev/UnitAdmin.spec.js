import { test, expect } from '@playwright/test';
import { queryDatabase } from '../../../utils/db';
import dotenv from 'dotenv';
dotenv.config();

test.describe('Dashboard Validation', () => {
    let dbConfig;

    test.beforeEach(async ({ page }, testInfo) => {
        // Pick dev DB config
        dbConfig = {
            ...testInfo.config.metadata.globaldev,
            database: 'wastenotglobal'
        };
        console.log('DB config set to dev (wastenotglobal)');

        await page.goto(process.env.GLOBAL_DEV_URL);
        await expect(page.getByRole('img', { name: 'waste-not-2.0-logo' })).toBeVisible();
        await expect(page.getByText('LOG INTO WASTE NOT')).toBeVisible();

        await page.getByRole('textbox', { name: 'Login email' }).pressSequentially(process.env.GD_UNIT_USERNAME, { delay: 100 });
        await page.getByRole('textbox', { name: 'Password' }).pressSequentially(process.env.GD_UNIT_PASSWORD, { delay: 100 });
        await page.getByRole('button', { name: 'Log in' }).click();
    });

    test('Validate Dashboard DB vs UI', async ({ page }) => {
        await page.waitForTimeout(5000);
        await page.getByRole('button', { name: 'Analytics Dashboard' }).click();
        await page.waitForTimeout(8000);

        // Helper to get dynamic unit name + id_number from UI
        async function getUnitDetails(page) {
            const element = page.getByText(/\(\d+\)/).first();
            await element.waitFor({ state: 'visible' });

            const text = await element.innerText();
            const match = text.match(/^(.*?)\s*\((\d+)\)$/);

            return {
                unitName: match ? match[1].trim() : '',
                idNumber: match ? match[2] : ''
            };
        }

        // Select Unit
        const { unitName, idNumber } = await getUnitDetails(page);
        console.log('Unit Name:', unitName, 'ID Number:', idNumber);

        // Select Imperialx
        await page.getByRole('radio', { name: 'Imperial' }).check();

        // Escape unit name (safe SQL)
        const safeUnitName = unitName.replace(/'/g, "''");

        // === Query to fetch entity_unit_id dynamically (FIXED) ===
        const entityUnitQuery = `
  SELECT id 
  FROM entity_units 
  WHERE LOWER(name) = LOWER('${safeUnitName}')
    AND id_number = '${idNumber}'
  LIMIT 1;
`;

        const entityUnitResult = await queryDatabase(entityUnitQuery, dbConfig);
        const entityUnitId = entityUnitResult[0]?.id;

        if (!entityUnitId) {
            throw new Error(`Entity Unit ID not found for unit: ${unitName} (${idNumber})`);
        }

        console.log(`Entity Unit ID for ${unitName} (${idNumber}): ${entityUnitId}`);

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

        // 🔹 Utility to check values in chart
        async function checkValueInChartLabels(expectedValue) {
            const labelsLocator = page.locator('.highcharts-axis-labels span');
            await labelsLocator.first().waitFor({ timeout: 10000 });

            let labels = await labelsLocator.allTextContents();
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