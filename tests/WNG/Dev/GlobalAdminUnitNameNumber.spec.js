import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { LoginPage, DashboardPage, ReportsPage, getDashboardDateRanges, getEntityUnitIdByNumber, fetchDashboardMetrics } from '../../../Page/GlobalPage.js';
import { testData } from '../../../utils/testData.js';

const ID_NUMBER      = Number(testData.get('WNG_DEV_UNIT_NUMBER', 323));
const UNIT_NAME_FULL = `${testData.get('WNG_DEV_UNIT_NAME_UI', 'Unit one')} (${ID_NUMBER})`;
const UNIT_NAME_DB   = testData.get('WNG_DEV_UNIT_NAME_DB', 'Unit One');
const EMAIL_ID       = testData.reportEmail;
const SCHEDULES = testData.schedules;

test.describe('Dashboard Validation – Global Admin (Unit Name + Number)', () => {
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

    console.log(UNIT_NAME_FULL);
    await dashboard.navigateToDashboard({ isGlobalAdmin: true });
    await dashboard.selectUnit(UNIT_NAME_FULL);
    await dashboard.selectImperial();

    const entityUnitId = await getEntityUnitIdByNumber(UNIT_NAME_DB, ID_NUMBER, dbConfig);
    const dateRanges   = getDashboardDateRanges();
    console.log(dateRanges);

    const dbValues = await fetchDashboardMetrics(entityUnitId, dateRanges, dbConfig);
    await dashboard.assertChartValues(dbValues);

    await reports.createAllSchedules(EMAIL_ID, SCHEDULES);
    await reports.sendNow(EMAIL_ID);
  });
});
