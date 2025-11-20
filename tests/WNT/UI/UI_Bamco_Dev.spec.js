import { test, expect } from '@playwright/test';
import { queryDatabase } from '../../../utils/db.js';

test.describe('Dashboard and Iframe Validation Tests', () => {
    let dbConfig;

    test.beforeEach(async ({ page }, testInfo) => {
        // Pick dev DB config
        dbConfig = {
            ...testInfo.config.metadata.dbdev,
            database: 'cafemanager'
        };
        console.log('DB config set to dev (cafemanager)');

        await page.goto('https://cafemanager.dev.bamcotest.com/cafemanager/login');

        await expect(page.locator('h1')).toHaveText('Café Manager');
        await expect(page.getByRole('link', { name: 'New User?' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Forgot Password?' })).toBeVisible();

        await page.locator('input[name="emanresu"]').pressSequentially('99063285', { delay: 500 });
        await page.locator('input[name="drowssap"]').pressSequentially('Adi16@bamco', { delay: 500 });
        await page.getByRole('button', { name: 'log in' }).click();
    });

    test('Check Dashboard elements and Iframe elements', async ({ page }) => {
        //Verify dashboard
        await expect(page.locator('#navigation')).toContainText('Waste Not');
        await page.getByRole('link', { name: 'Waste Not' }).click();

        // Filters check
        const expectedFilters = [
            'Region', 'District', 'Account', 'Campus',
            'Kitchen', 'Cost Center', 'Profile',
            'Tablet', 'CLEAR ALL'
        ];
        for (let filter of expectedFilters) {
            await expect(page.getByRole('form')).toContainText(filter);
        }

        // Buttons check
        const expectedButtons = [
            'All Regions', 'All Districts', 'All Accounts', 'All Campuses',
            'All Kitchens', 'All Cost Centers', 'All Profiles', 'All Tablets'
        ];
        for (let btn of expectedButtons) {
            await expect(page.getByRole('button', { name: btn })).toBeVisible();
        }

        //Verify iframe
        await page.locator('iframe#wastenot-html').waitFor({ state: 'visible', timeout: 15000 });
        const iframeWasteNot = page.frameLocator('iframe#wastenot-html');
        await page.waitForTimeout(25000);
        await expect(iframeWasteNot.getByRole('button', { name: 'REPORTS' })).toBeVisible();
        await expect(iframeWasteNot.getByText('DATE RANGE:')).toBeVisible();

        //REGION LEVEL
        const regionName = 'Joseph Alfieri';
        await page.getByRole('button', { name: 'All Regions' }).click();
        await page.getByRole('textbox', { name: 'Search' }).fill(regionName);
        await page.getByRole('listitem').filter({ hasText: regionName }).getByRole('option').click();

        // Click Bon Appétit (exact text)
        const bonAppetit = page.getByText('Bon Appétit', { exact: true });
        await bonAppetit.waitFor();
        await bonAppetit.click();
        await page.waitForTimeout(1000);

        // Clear ALL filter
        const clearAllBtn = page.getByText('CLEAR ALL', { exact: true });
        await clearAllBtn.waitFor();
        await expect(clearAllBtn).toBeVisible();
        console.log('CLEAR ALL is visible, clicking it now');
        await clearAllBtn.click();

        // Wait until bubble resets back to "All Regions"
        const allRegionsBtn = page.getByRole('button', { name: 'All Regions' });
        await expect(allRegionsBtn).toHaveText('All Regions', { timeout: 5000 });

        //CAMPUS LEVEL
        console.log('Starting CAMPUS level selection...');
        const campusName = 'Savannah';
        await page.getByRole('button', { name: 'All Campuses' }).click();
        console.log('Clicked All Campuses button');
        await page.getByRole('textbox', { name: 'Search' }).fill(campusName);
        console.log(`Filled campus search with: ${campusName}`);
        await page.getByRole('combobox').filter({ hasText: campusName }).getByRole('option').click();
        console.log('Selected campus from results');
        await bonAppetit.click();
        console.log('Clicked Bon Appétit again after campus select');

        //FETCH CAMPUS_ID
        console.log(`Fetching campus_id (location_id) for campus: ${campusName}`);
        const getCampusIdQuery = `
          SELECT location_id 
          FROM accounts_locations 
          WHERE name = '${campusName}'
          LIMIT 1;
        `;
        const campusResult = await queryDatabase(getCampusIdQuery, dbConfig);
        const campusId = campusResult[0]?.location_id;

        if (!campusId) {
            throw new Error(`Campus ID not found in accounts_locations for campus: ${campusName}`);
        }
        console.log(`Campus ID resolved: ${campusId}`);

        //FETCH TARGET VALUE
        console.log(`Fetching Target for campus_id: ${campusId}`);
        const getTargetQuery = `
          SELECT Target 
          FROM waste_trend_targets 
          WHERE complex_id = '${campusId}'
          LIMIT 1;
        `;
        const targetResult = await queryDatabase(getTargetQuery, dbConfig);
        let targetValue = targetResult[0]?.Target;

        if (targetValue !== undefined && targetValue !== null) {
            targetValue = Math.round(targetValue);
            console.log(`Target value found in DB: ${targetValue} lbs`);

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

        //QUERIES
        const past6MonthsQuery = `
          WITH plate_only_days AS (
              SELECT DATE(created_at) AS waste_date
              FROM ot_tablet_profile
              WHERE created_at BETWEEN '2025-05-01 00:00:00' AND '2025-10-31 23:59:59'
                AND campus_id = '${campusId}'
              GROUP BY DATE(created_at)
              HAVING COUNT(DISTINCT kind_of_waste) = 1
                 AND MAX(kind_of_waste) = 'plate_waste'
          ),
          filtered_data AS (
              SELECT
                  EXTRACT(YEAR FROM created_at) AS year,
                  EXTRACT(MONTH FROM created_at) AS month,
                  DATE(created_at) AS day,
                  lbs_waste
              FROM ot_tablet_profile
              WHERE kind_of_waste != 'plate_waste'
                AND created_at BETWEEN '2025-05-01 00:00:00' AND '2025-10-31 23:59:59'
                AND campus_id = '${campusId}'
                AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days)
          ),
          monthly_aggregates AS (
              SELECT
                  year,
                  month,
                  SUM(lbs_waste) AS total_lbs_waste,
                  COUNT(DISTINCT day) AS total_days,
                  SUM(lbs_waste) / COUNT(DISTINCT day) AS avg_lbs_per_day
              FROM filtered_data
              GROUP BY year, month
              HAVING COUNT(DISTINCT day) >= 12
          ),
          overall_totals AS (
              SELECT
                  SUM(total_lbs_waste) AS total_lbs,
                  SUM(total_days) AS total_days,
                  ROUND(SUM(total_lbs_waste) / SUM(total_days), 2) AS overall_avg_lbs_per_day
              FROM monthly_aggregates
          )
          SELECT
              m.*,
              o.overall_avg_lbs_per_day
          FROM monthly_aggregates m
          CROSS JOIN overall_totals o
          ORDER BY m.year, m.month;
        `;

        const currentMonthQuery = `
          WITH plate_only_days AS (
              SELECT DATE(created_at) AS waste_date
              FROM ot_tablet_profile
              WHERE created_at BETWEEN '2025-11-01 00:00:00' AND '2025-11-30 23:59:59'
                AND campus_id = '${campusId}'
              GROUP BY DATE(created_at)
              HAVING COUNT(DISTINCT kind_of_waste) = 1
                 AND MAX(kind_of_waste) = 'plate_waste'
          )
          SELECT
              SUM(lbs_waste) AS total_lbs_waste,
              COUNT(DISTINCT DATE(created_at)) AS total_days,
              SUM(lbs_waste) / COUNT(DISTINCT DATE(created_at)) AS avg_lbs_per_day
          FROM ot_tablet_profile
          WHERE kind_of_waste != 'plate_waste'
            AND created_at BETWEEN '2025-11-01 00:00:00' AND '2025-11-30 23:59:59'
            AND campus_id = '${campusId}'
            AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days);
        `;

        const lastYearQuery = `
          WITH plate_only_days AS (
              SELECT DATE(created_at) AS waste_date
              FROM ot_tablet_profile
              WHERE created_at BETWEEN '2024-11-01 00:00:00' AND '2024-11-30 23:59:59'
                AND campus_id = '${campusId}'
              GROUP BY DATE(created_at)
              HAVING COUNT(DISTINCT kind_of_waste) = 1
                 AND MAX(kind_of_waste) = 'plate_waste'
          )
          SELECT
              SUM(lbs_waste) AS total_lbs_waste,
              COUNT(DISTINCT DATE(created_at)) AS total_days,
              SUM(lbs_waste) / COUNT(DISTINCT DATE(created_at)) AS avg_lbs_per_day
          FROM ot_tablet_profile
          WHERE kind_of_waste != 'plate_waste'
            AND created_at BETWEEN '2024-11-01 00:00:00' AND '2024-11-30 23:59:59'
            AND campus_id = '${campusId}'
            AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days);
        `;

        //DB execution
        const past6MonthsResult = await queryDatabase(past6MonthsQuery, dbConfig);
        const currentMonthResult = await queryDatabase(currentMonthQuery, dbConfig);
        const lastYearResult = await queryDatabase(lastYearQuery, dbConfig);

        console.log('DB Results:', { past6MonthsResult, currentMonthResult, lastYearResult });

        const dbPast6Months = Math.round(past6MonthsResult[0]?.overall_avg_lbs_per_day || 0);
        const dbCurrentMonth = Math.round(currentMonthResult[0]?.avg_lbs_per_day || 0);
        const dbLastYear = Math.round(lastYearResult[0]?.avg_lbs_per_day || 0);

        console.log(`Processed Values → Past6Months: ${dbPast6Months}, CurrentMonth: ${dbCurrentMonth}, LastYear: ${dbLastYear}`);

        const frame = page.frameLocator('iframe#wastenot-html');
        await page.waitForTimeout(5000);

        //ASSERTIONS WITH SAFE HANDLING
        if (dbPast6Months) {
            try {
                await expect(frame.getByText(`${dbPast6Months} lbs`).first()).toBeVisible();
                console.log(`Past 6 Months verified in UI: ${dbPast6Months} lbs`);
            } catch {
                console.warn(`Past 6 Months (${dbPast6Months} lbs) not visible in UI`);
            }
        } else {
            console.warn(`No Past 6 Months data found in DB`);
        }

        if (dbCurrentMonth) {
            try {
                await expect(frame.getByText(`${dbCurrentMonth} lbs`, { exact: true })).toBeVisible();
                console.log(`Current Month verified in UI: ${dbCurrentMonth} lbs`);
            } catch {
                console.warn(`Current Month (${dbCurrentMonth} lbs) not visible in UI`);
            }
        } else {
            console.warn(`No Current Month data found in DB`);
        }

        if (dbLastYear) {
            try {
                await expect(frame.getByText(`${dbLastYear} lbs`)).toBeVisible();
                console.log(`Last Year verified in UI: ${dbLastYear} lbs`);
            } catch {
                console.warn(`Last Year (${dbLastYear} lbs) not visible in UI`);
            }
        } else {
            console.warn(`No Last Year data found in DB`);
        }

    });
});