import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { queryDatabase } from '../../../utils/db.js';

dotenv.config();

// -----------------------------------
// Global Validation Helper
// Allows:
// - rounding to 2 decimals
// - variance up to ±2
// -----------------------------------

function validateMetric(
    actualValue,
    expectedValue,
    metricName = 'Metric'
) {
    const actual = Number(
        Number(actualValue).toFixed(2)
    );

    const expected = Number(
        Number(expectedValue).toFixed(2)
    );

    const difference = Math.abs(
        actual - expected
    );

    console.log('\n==============================');

    console.log(`Validation : ${metricName}`);

    console.log('Expected   :', expected);

    console.log('Actual     :', actual);

    console.log('Difference :', difference);

    console.log('==============================\n');

    // Allow ±2 variance globally
    expect(difference).toBeLessThanOrEqual(2);

    console.log(
        `✅ ${metricName} validated successfully`
    );
}

// -----------------------------------
// Global Test Configuration
// -----------------------------------
test.describe.configure({ mode: 'serial' });

test.describe('Dashboard and Iframe Validation Tests', () => {
    let dbConfig;

    // Global timeout
    test.setTimeout(180000);

    test.beforeEach(async ({ page }, testInfo) => {

        // -----------------------------------
        // DB Config
        // -----------------------------------
        dbConfig = {
            ...testInfo.config.metadata.dbdev,
            database: 'cafemanager',
        };

        console.log('Using DEV DB Config → cafemanager');

        // -----------------------------------
        // Stable Page Timeouts
        // -----------------------------------
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(60000);

        // -----------------------------------
        // Open Login Page
        // -----------------------------------
        await page.goto(process.env.BAMCO_DEV_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        // -----------------------------------
        // Login Page Validation
        // -----------------------------------
        await expect(page.locator('h1')).toHaveText('Café Manager');

        await expect(
            page.getByRole('link', { name: 'New User?' })
        ).toBeVisible();

        await expect(
            page.getByRole('link', { name: 'Forgot Password?' })
        ).toBeVisible();

        // -----------------------------------
        // Login
        // -----------------------------------
        await page.locator('input[name="emanresu"]').fill(
            process.env.BAMCO_USERNAME
        );

        await page.locator('input[name="drowssap"]').fill(
            process.env.BAMCO_PASSWORD
        );

        // -----------------------------------
        // Click Login
        // -----------------------------------
        await Promise.all([
            page.waitForLoadState('networkidle'),
            page.getByRole('button', { name: /log in/i }).click(),
        ]);

        // -----------------------------------
        // Dashboard Validation
        // -----------------------------------
        await expect(
            page.locator('#navigation')
        ).toContainText('Waste Not');
    });

    test('Check Dashboard elements and Iframe elements', async ({ page }) => {

        // -----------------------------------
        // Open Food Standards
        // -----------------------------------
        await Promise.all([
            page.waitForLoadState('networkidle'),
            page.getByRole('link', { name: 'Food Standards' }).click(),
        ]);

        // -----------------------------------
        // Hover Account Dropdown
        // IMPORTANT:
        // Dropdown only stays open while hovering
        // -----------------------------------
        const accountMenu = page
            .locator('text=Wellness Team - Wellness Team')
            .first();

        await expect(accountMenu).toBeVisible({
            timeout: 60000,
        });

        // Hover to open mega menu
        await accountMenu.hover();

        // -----------------------------------
        // Search Account
        // -----------------------------------
        const searchBox = page.locator('#account-search');

        await searchBox.waitFor({
            state: 'visible',
            timeout: 60000,
        });

        await searchBox.click();

        await searchBox.fill('adobe');

        // Wait for dropdown rendering
        await page.waitForTimeout(2000);

        // -----------------------------------
        // Wait for Founders Tower Result
        // -----------------------------------
        const foundersTower = page
            .getByText('Founders Tower')
            .first();

        await expect(foundersTower).toBeVisible({
            timeout: 60000,
        });

        // -----------------------------------
        // JS Click
        // Normal click fails because dropdown
        // loses hover focus / viewport issues
        // -----------------------------------
        await foundersTower.evaluate(el => el.click());

        // Wait for navigation/render
        await page.waitForLoadState('networkidle');

        // -----------------------------------
        // Re-open Food Standards
        // -----------------------------------
        await Promise.all([
            page.waitForLoadState('networkidle'),
            page.getByRole('link', { name: 'Food Standards' }).click(),
        ]);

        // -----------------------------------
        // Dashboard Validation
        // -----------------------------------
        await expect(
            page.getByRole('main')
        ).toContainText('[FOOD STANDARD DASHBOARD]', {
            timeout: 60000,
        });

        await expect(
            page.getByTestId('hamburger-icon')
        ).toBeVisible();

        // -----------------------------------
        // Filter Navigation
        // -----------------------------------
        await page.getByText('ACCOUNT', { exact: true }).click();

        await page.getByText('CAMPUS', { exact: true }).click();

        await page.getByText('CAFE', { exact: true }).click();

        // -----------------------------------
        // Adobe Selection
        // -----------------------------------
        const adobeOption = page
            .locator('div')
            .filter({ hasText: /^Adobe$/ })
            .last();

        await adobeOption.scrollIntoViewIfNeeded();

        await adobeOption.click({
            force: true,
        });

        // -----------------------------------
        // Direct Navigation
        // -----------------------------------
        await page.goto(
            'https://cafemanager.dev.bamcotest.com/food-standard-app/food-standards',
            {
                waitUntil: 'networkidle',
                timeout: 60000,
            }
        );

        // -----------------------------------
        // PALETTES Section
        // -----------------------------------
        await page.getByText('PALETTES').click();

        await expect(
            page.getByRole('heading', { name: 'PALETTES' })
        ).toBeVisible();

        // -----------------------------------
        // Validate Tabs
        // -----------------------------------
        await Promise.all([
            expect(
                page.getByRole('tab', { name: 'PURCHASING' })
            ).toBeVisible(),

            expect(
                page.getByRole('tab', { name: 'CLIMATE CHANGE' })
            ).toBeVisible(),

            expect(
                page.getByRole('tab', { name: 'PLANT-FORWARD' })
            ).toBeVisible(),

            expect(
                page.getByRole('tab', { name: 'WELLNESS' })
            ).toBeVisible(),
        ]);

        // -----------------------------------
        // Open Climate Change Tab
        // -----------------------------------
        await page.getByRole('tab', {
            name: 'CLIMATE CHANGE',
        }).click();

        await page.waitForLoadState('networkidle');

        // -----------------------------------
        // Toggle Switch
        // -----------------------------------
        const toggle = page.locator('.MuiSwitch-thumb').first();

        await expect(toggle).toBeVisible();

        await toggle.click({
            force: true,
        });

        // -----------------------------------
        // Period Dropdown
        // -----------------------------------
        const periodDropdown = page
            .getByRole('button', { name: 'Open' })
            .nth(1);

        await expect(periodDropdown).toBeVisible();

        await periodDropdown.click();

        await expect(
            page.getByRole('option', { name: 'P07' })
        ).toBeVisible();

        await page.getByRole('option', { name: 'P07' }).click();

        // -----------------------------------
        // Final Content Validation
        // -----------------------------------
        await Promise.all([

            expect(
                page.getByText('low carbon lifestyle')
            ).toBeVisible(),

            expect(
                page.locator('div').filter({
                    hasText: /^PRIORITIZING PLANT-BASED PROTEINS$/,
                }).nth(1)
            ).toBeVisible(),

            expect(
                page.getByRole('heading', {
                    name: 'BEEF PER MEAL',
                })
            ).toBeVisible(),

            expect(
                page.getByRole('heading', {
                    name: 'ANIMAL PROTEINS PER MEAL',
                })
            ).toBeVisible(),

            expect(
                page.getByRole('heading', {
                    name: 'CHEESE SPEND',
                })
            ).toBeVisible(),

            expect(
                page.getByRole('heading', {
                    name: 'MEAL PERIODS WITHOUT THREE',
                })
            ).toBeVisible(),

            expect(
                page.getByRole('heading', {
                    name: 'MEAL PERIODS WITHOUT ONE',
                })
            ).toBeVisible(),
        ]);

        // -----------------------------------
        // DB Calculation - Animal Proteins Per Meal
        // Formula = (SUM(lbs) * 16) / SUM(cust_count)
        // -----------------------------------

        const lbsQuery = `
    SELECT COALESCE(SUM(lbs), 0) AS lbs
    FROM purchases
    WHERE financial_code = '25556'
      AND plant IN (
        '10','11','12','13',
        '14','15','16','17'
      )
      AND processing_month_date = '2026-04-01';
`;

        const custCountQuery = `
    SELECT COALESCE(SUM(cust_count), 0) AS cust_count
    FROM customer_counts
    WHERE unit_number = '25556'
      AND end_date = '2026-04-30';
`;

        // Run queries in parallel
        const [lbsData, custData] = await Promise.all([
            queryDatabase(lbsQuery, dbConfig),
            queryDatabase(custCountQuery, dbConfig),
        ]);

        // Extract DB values
        const lbs = Number(lbsData[0]?.lbs || 0);

        const custCount = Number(
            custData[0]?.cust_count || 0
        );

        // Prevent divide-by-zero
        if (!custCount) {
            throw new Error(
                'Customer count is 0. Cannot calculate Animal Proteins Per Meal.'
            );
        }

        // Calculate expected value
        const expectedValue = Number(
            ((lbs * 16) / custCount).toFixed(1)
        );

        // -----------------------------------
        // Console Logs
        // -----------------------------------
        console.log('\n========== DB RESULT ==========');

        console.log('Total LBS            :', lbs);

        console.log('Customer Count       :', custCount);

        console.log('Expected UI Value    :', expectedValue);

        console.log('===============================\n');

        // -----------------------------------
        // UI Validation
        // -----------------------------------

        // Locate card using heading
        const animalProteinCard = page
            .locator('div')
            .filter({
                has: page.locator('h2', {
                    hasText: 'ANIMAL PROTEINS PER MEAL',
                }),
            })
            .first();

        // Wait for card
        await expect(animalProteinCard).toBeVisible({
            timeout: 60000,
        });

        // Get UI numeric value only
const uiValueText = await animalProteinCard
    .locator('p')
    .filter({
        hasText: /^[0-9]+(\.[0-9]+)?$/,
    })
    .first()
    .textContent();

// Clean UI value
const actualValue = Number(
    uiValueText?.trim()
);

        // Console Logs
        console.log('Actual UI Value      :', actualValue);

        // Assertion
        validateMetric(
    actualValue,
    expectedValue,
    'Animal Proteins Per Meal'
);

        console.log(
            '✅ Animal Proteins Per Meal validated successfully'
        );

        // -----------------------------------
// DB Validation - Cheese Spend
// -----------------------------------

const cheeseSpendQuery = `
    SELECT COALESCE(SUM(spend), 0) AS spend
    FROM purchases
    WHERE financial_code IN ('25556')
      AND mfrItem_parent_category_code = 'MCC-10017'
      AND processing_month_date = '2026-04-01';
`;

// Run DB Query
const cheeseSpendData = await queryDatabase(
    cheeseSpendQuery,
    dbConfig
);

// Extract DB Value
const totalCheeseSpend = Number(
    cheeseSpendData[0]?.spend || 0
);

// Round like UI
const expectedCheeseSpend = Math.round(
    totalCheeseSpend
);

// -----------------------------------
// Console Logs
// -----------------------------------
console.log('\n========== CHEESE SPEND ==========');

console.log(
    'Expected Cheese Spend :',
    expectedCheeseSpend
);

console.log('==================================\n');

// -----------------------------------
// UI Validation - Cheese Spend
// -----------------------------------

// Locate CHEESE SPEND card
const cheeseSpendCard = page
    .locator('div')
    .filter({
        has: page.locator('h2', {
            hasText: 'CHEESE SPEND',
        }),
    })
    .first();

// Wait for card
await expect(cheeseSpendCard).toBeVisible({
    timeout: 60000,
});

// Extract UI currency value
const cheeseSpendText = await cheeseSpendCard
    .locator('text=/\\$[0-9,]+/')
    .first()
    .textContent();

// Clean UI Value
const actualCheeseSpend = Number(
    cheeseSpendText
        ?.replace('$', '')
        ?.replace(/,/g, '')
        ?.trim()
);

// Console Logs
console.log(
    'Actual UI Cheese Spend :',
    actualCheeseSpend
);

// Assertion
expect(actualCheeseSpend).toBe(
    expectedCheeseSpend
);

console.log(
    '✅ Cheese Spend validated successfully'
);

        console.log(
            '✅ Dashboard and iframe validation completed successfully'
        );
    });
});