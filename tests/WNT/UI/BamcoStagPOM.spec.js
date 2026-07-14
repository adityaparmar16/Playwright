import { test } from '@playwright/test';
import { BamcoPage } from '../../../Page/BamcoPage.js';
import { runDashboardAndIframeTest } from '../../../utils/bamcoHelpers.js';
import dotenv from 'dotenv';
dotenv.config();

test.describe('Dashboard and Iframe Validation Tests — DEV', () => {
    let dbConfig;

    test.beforeEach(async ({ page }, testInfo) => {
        dbConfig = { ...testInfo.config.metadata.dbstag, database: 'cafemanager' };
        console.log('DB config set to staging (cafemanager)');

        const bamco = new BamcoPage(page);
        await bamco.goto(process.env.BAMCO_STAGING_URL);
        await bamco.login(process.env.BAMCO_USERNAME, process.env.BAMCO_PASSWORD);
    });

    test('Check Dashboard elements and Iframe elements', async ({ page }) => {
        await runDashboardAndIframeTest(page, dbConfig, {
            campusName : 'Savannah',
            iframeWait : 25000,
        });
    });
});