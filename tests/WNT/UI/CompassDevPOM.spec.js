import { test } from '@playwright/test';
import { CompassPage } from '../../../Page/CompassPage.js';
import { buildDateRanges, runWasteQueries } from '../../../utils/bamcoHelpers.js';
import dotenv from 'dotenv';
dotenv.config();

const COMPLEX_ID  = 'C-58001';
const REPORT_EMAIL   = 'aditya.parmar@ccube.com';

test.describe('WasteNot - Complex DB Validation', () => {
    let dbConfig;

    test.beforeEach(async ({}, testInfo) => {
        dbConfig = { ...testInfo.config.metadata.dbdev, database: 'cafemanager' };
    });

    test('Validate UI data with DB for Complex', async ({ page }) => {
        test.setTimeout(360000);

        const compass = new CompassPage(page);

        // ── 1. Login ────────────────────────────────────────────────
        await compass.goto(process.env.COMPASS_DEV_URL, process.env.WASTENOT_LOGIN_ID);
        await compass.submitLoginAndEnterPassword(process.env.WASTENOT_PASSWORD);

        if (process.env.DEBUG_MFA === 'true') await page.pause();

        await compass.handleMfa();
        await compass.handleOtp(process.env.WASTENOT_OTP);
        await compass.dismissStaySignedIn();

        // ── 2. Assert dashboard loaded ───────────────────────────────
        await compass.assertDashboardVisible();
        await compass.assertIframeElementsVisible();

        // ── 3. Select complex ────────────────────────────────────────
        await compass.selectComplex(COMPLEX_ID);

        // ── 4. Assert waste section visible ──────────────────────────
        await compass.assertWasteSectionVisible();

        // ── 5. Date ranges & DB queries ──────────────────────────────
        const dates = buildDateRanges({ useYesterdayAsCurrentEnd: true });
        console.log(dates);

        const { dbPast6Months, dbCurrentMonth, dbLastYear } =
            await runWasteQueries(COMPLEX_ID, dates, dbConfig);

        // ── 6. Assert iframe lbs values ──────────────────────────────
        await page.waitForTimeout(5000);
        await compass.assertIframeLbsValue(dbPast6Months,  'Past 6 Months');
        await compass.assertIframeLbsValue(dbCurrentMonth, 'Current Month', true);
        await compass.assertIframeLbsValue(dbLastYear,     'Last Year');

        // ── 7. Send Now report ───────────────────────────────────────
        await compass.sendNowReport(
            [REPORT_EMAIL],
            'Compass - Now Report via Automation'
        );

        // ── 8. Schedule report ───────────────────────────────────────
        await compass.scheduleReport({
            email     : REPORT_EMAIL,
            frequency : 'Daily',
            dateRange : 'Fiscal Month to Date',
            subject   : 'Scheduled Report via Automation',
        });
    });
});