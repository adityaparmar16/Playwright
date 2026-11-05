import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { LoginPage, DashboardPage, ReportsPage, getDashboardDateRanges, getEntityUnitId, fetchDashboardMetrics } from '../../../Page/GlobalPage.js';
import { testData } from '../../../utils/testData.js';

const UNIT_NAME = testData.unitName('DEV', 'GLOBALADMIN', 'abbb');
const EMAIL_ID  = testData.reportEmail;
const SCHEDULES = testData.schedules;

test.describe('Dashboard Validation – Global Admin (Unit Name)', () => {
  let dbConfig;

  test.beforeEach(async ({ page }, testInfo) => {
    dbConfig = { ...testInfo.config.metadata.globaldev, database: testData.wngDbName };
    console.log('DB config set to dev (wastenotglobal)');

    const loginPage = new LoginPage(page);
    await loginPage.goto(process.env.GLOBAL_DEV_URL);
    await loginPage.assertPageLoaded();
    await loginPage.login(process.env.GD_ADMIN_USERNAME, process.env.GD_ADMIN_PASSWORD);
  });

  test('Validate Dashboard DB vs UI', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const reports   = new ReportsPage(page);

    await dashboard.navigateToDashboard({ isGlobalAdmin: true });
    await dashboard.selectUnit(UNIT_NAME);
    await dashboard.selectImperial();

    const entityUnitId = await getEntityUnitId(UNIT_NAME, dbConfig);
    const dateRanges   = getDashboardDateRanges();
    console.log(dateRanges);

    const dbValues = await fetchDashboardMetrics(entityUnitId, dateRanges, dbConfig);
    await dashboard.assertChartValues(dbValues);

    await reports.createAllSchedules(EMAIL_ID, SCHEDULES);
    await reports.sendNow(EMAIL_ID);
  });
});
