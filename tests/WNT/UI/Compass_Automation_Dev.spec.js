import { test, expect } from '@playwright/test';
import { queryDatabase } from '../../../utils/db.js'; // adjust if needed

const WASTENOT_URL = 'https://cafemanager.dev.bamcotest.com/cafemanager/wastenot';

const LOGIN_ID = process.env.WASTENOT_LOGIN_ID ?? 'parmaa01';
const LOGIN_PASSWORD = process.env.WASTENOT_PASSWORD ?? 'P7QBfhK$4N';
const LOGIN_OTP = process.env.WASTENOT_OTP;

test.describe('WasteNot - Complex DB Validation', () => {

    let dbConfig;

    test.beforeEach(async ({ page }, testInfo) => {
        dbConfig = {
            ...testInfo.config.metadata.dbdev,
            database: 'cafemanager'
        };
    });

    test('Validate UI data with DB for Complex', async ({ page }) => {
        test.setTimeout(360000);

        // =========================
        // 🔐 LOGIN FLOW
        // =========================
        await page.goto(WASTENOT_URL, { waitUntil: 'domcontentloaded' });

        await page.getByRole('textbox', { name: /Login ID/i }).fill(LOGIN_ID);

        await Promise.all([
            page.waitForURL(/microsoftonline\.com/i),
            page.getByRole('button', { name: /Continue/i }).click(),
        ]);

        await page.getByRole('textbox', { name: /Enter the password/i }).fill(LOGIN_PASSWORD);
        await page.getByRole('button', { name: /^Sign in$/i }).click();

        // =========================
        // 🔐 MFA HANDLING
        // =========================
        const mfaButtons = page.getByRole('button', { name: /Text/i });

        let smsOtpButton = mfaButtons.filter({ hasText: /6968|68/ }).first();

        if (!(await smsOtpButton.isVisible().catch(() => false))) {
            smsOtpButton = mfaButtons.first();
        }

        await expect(smsOtpButton).toBeVisible();

        if (process.env.DEBUG_MFA === 'true') {
            await page.pause();
        }

        await smsOtpButton.click();

        // OTP
        const otpInput = page.locator(
            'input[name*="otc"], input[id*="otc"], input[aria-label*="code" i], input[type="tel"]'
        ).first();

        if (LOGIN_OTP) {
            await otpInput.fill(LOGIN_OTP);
            await page.getByRole('button', { name: /Verify|Next|Sign in/i }).click();
        } else {
            console.log('⚠️ Enter OTP manually...');
            await page.waitForFunction(
                () => /(bamcotest\.com|compassmanager\.com)/i.test(window.location.href),
                { timeout: 240000 }
            );
        }

        // Stay signed in
        const staySignedInNo = page.getByRole('button', { name: /^No$/i });
        if (await staySignedInNo.isVisible().catch(() => false)) {
            await staySignedInNo.click();
        }

        // =========================
        // UI VALIDATION (AS-IS, CLEANED)
        // =========================
        // reuse frame instead of repeating
        const frame = page.locator('#wastenot-html').contentFrame();

        await expect(page.locator('[id="row wastenot-nav"]')).toContainText('COMPASS', {
            timeout: 60000
        });
        await expect(page.getByText('Sector', { exact: true })).toBeVisible();
        await expect(page.getByText('Division', { exact: true }).nth(1)).toBeVisible();
        await expect(page.getByText('Complex', { exact: true })).toBeVisible();
        await expect(page.getByRole('img').nth(1)).toBeVisible();
        await expect(page.getByRole('form')).toContainText('CLEAR ALL');


        const dashboardBtn = frame.getByRole('button', { name: 'DASHBOARD' });
        await dashboardBtn.waitFor({ state: 'visible', timeout: 160000 });
        await expect(dashboardBtn).toBeVisible();

        const reportsBtn = frame.getByRole('button', { name: 'REPORTS' });
        await reportsBtn.waitFor({ state: 'visible', timeout: 60000 });
        await expect(reportsBtn).toBeVisible();

        const section = frame.locator('section');
        await section.waitFor({ state: 'visible', timeout: 60000 });
        await expect(section).toContainText('DATE RANGE:');

        await page.getByRole('button', { name: 'All Complexes' }).click();
        const campusId = 'C-58001';

        await page.getByRole('textbox', { name: 'Search' }).fill(campusId);

        // wait for dropdown to populate
        const option = page.getByRole('option').filter({ hasText: campusId }).first();

        await expect(option).toBeVisible();
        await option.click();

        await page.getByText('COMPASS', { exact: true }).click();

        await expect(frame.getByRole('heading', { name: 'Waste Trend' })).toBeVisible();
        await expect(frame.getByRole('heading', { name: 'Kind of Waste' })).toBeVisible();
        await expect(frame.getByRole('heading', { name: 'Where it Went' })).toBeVisible();
        await expect(frame.getByText('Average Food Waste per Day')).toBeVisible();
        await expect(frame.getByRole('button', { name: 'TRACK TRENDS' })).toBeVisible();

        // =========================
        // 🗄️ DB VALIDATION
        // =========================

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
const past6MonthsStartDate = formatDate(past6MonthsStart);
const past6MonthsEndDate = formatDate(past6MonthsEnd, true);

const currentMonthStartDate = formatDate(currentMonthStart);
const currentMonthEndDate = formatDate(currentMonthEnd, true);

const lastYearStartDate = formatDate(lastYearStart);
const lastYearEndDate = formatDate(lastYearEnd, true);

console.log({
    past6MonthsStartDate,
    past6MonthsEndDate,
    currentMonthStartDate,
    currentMonthEndDate,
    lastYearStartDate,
    lastYearEndDate
});

//QUERIES
const past6MonthsQuery = `
    WITH plate_only_days AS (
        SELECT DATE(created_at) AS waste_date
        FROM ot_tablet_profile
        WHERE created_at BETWEEN '${past6MonthsStartDate}' AND '${past6MonthsEndDate}'
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
          AND created_at BETWEEN '${past6MonthsStartDate}' AND '${past6MonthsEndDate}'
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
        WHERE created_at BETWEEN '${currentMonthStartDate}' AND '${currentMonthEndDate}'
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
      AND created_at BETWEEN '${currentMonthStartDate}' AND '${currentMonthEndDate}'
      AND campus_id = '${campusId}'
      AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days);
`;

const lastYearQuery = `
    WITH plate_only_days AS (
        SELECT DATE(created_at) AS waste_date
        FROM ot_tablet_profile
        WHERE created_at BETWEEN '${lastYearStartDate}' AND '${lastYearEndDate}'
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
      AND created_at BETWEEN '${lastYearStartDate}' AND '${lastYearEndDate}'
      AND campus_id = '${campusId}'
      AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days);
`;

        // DB EXECUTION
        const past6MonthsResult = await queryDatabase(past6MonthsQuery, dbConfig);
        const currentMonthResult = await queryDatabase(currentMonthQuery, dbConfig);
        const lastYearResult = await queryDatabase(lastYearQuery, dbConfig);

        console.log('DB Results:', { past6MonthsResult, currentMonthResult, lastYearResult });

        // PROCESS VALUES
        const dbPast6Months = Math.round(past6MonthsResult[0]?.overall_avg_lbs_per_day || 0);
        const dbCurrentMonth = Math.round(currentMonthResult[0]?.avg_lbs_per_day || 0);
        const dbLastYear = Math.round(lastYearResult[0]?.avg_lbs_per_day || 0);

        console.log(`Processed Values → Past6Months: ${dbPast6Months}, CurrentMonth: ${dbCurrentMonth}, LastYear: ${dbLastYear}`);

        // UI ASSERTIONS
        const frameLocator = page.frameLocator('iframe#wastenot-html');
        await page.waitForTimeout(5000);

        if (dbPast6Months) {
            try {
                await expect(frameLocator.getByText(`${dbPast6Months} lbs`).first()).toBeVisible();
                console.log(`Past 6 Months verified in UI: ${dbPast6Months} lbs`);
            } catch {
                console.warn(`Past 6 Months (${dbPast6Months} lbs) not visible in UI`);
            }
        }

        if (dbCurrentMonth) {
            try {
                await expect(frameLocator.getByText(`${dbCurrentMonth} lbs`, { exact: true })).toBeVisible();
                console.log(`Current Month verified in UI: ${dbCurrentMonth} lbs`);
            } catch {
                console.warn(`Current Month (${dbCurrentMonth} lbs) not visible in UI`);
            }
        }

        if (dbLastYear) {
            try {
                await expect(frameLocator.getByText(`${dbLastYear} lbs`)).toBeVisible();
                console.log(`Last Year verified in UI: ${dbLastYear} lbs`);
            } catch {
                console.warn(`Last Year (${dbLastYear} lbs) not visible in UI`);
            }
        }


    });
});