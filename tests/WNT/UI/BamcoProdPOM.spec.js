import { test } from '@playwright/test';
import { BamcoPage } from '../../../Page/BamcoPage.js';
import { runDashboardAndIframeTest } from '../../../utils/bamcoHelpers.js';
import dotenv from 'dotenv';
dotenv.config();

test.describe('Dashboard and Iframe Validation Tests — PROD', () => {
    let dbConfig;

    test.beforeEach(async ({ page }, testInfo) => {
        dbConfig = { ...testInfo.config.metadata.dbproduction, database: 'cafemanager' };
        console.log('DB config set to prod (cafemanager)');

        const bamco = new BamcoPage(page);
        await bamco.goto(process.env.BAMCO_PROD_URL);
        await bamco.login(process.env.BAMCO_USERNAME, process.env.BAMCO_PASSWORD);
    });

    test('Check Dashboard elements and Iframe elements', async ({ page }) => {
        await runDashboardAndIframeTest(page, dbConfig, {
            campusName : 'Whitman College',
            iframeWait : 15000,
        });
    });
});