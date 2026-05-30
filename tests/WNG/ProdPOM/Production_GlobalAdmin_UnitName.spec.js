import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { LoginPage, DashboardPage, ReportsPage, getDashboardDateRanges, getEntityUnitId, fetchDashboardMetrics } from '../../../Page/index.js';

const UNIT_NAME = 'Asyaport';
const EMAIL_ID  = 'aditya.parmar@ccube.com';
const SCHEDULES = [
  { type: 'Everyday', timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Monday',    timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Wednesday', timezone: 'Eastern Standard Time' },
];

test.describe('Dashboard Validation – Global Admin | Production (Unit Name)', () => {
  let dbConfig;

  test.beforeEach(async ({ page }, testInfo) => {
    dbConfig = { ...testInfo.config.metadata.globalprod, database: 'wastenotglobal' };
    console.log('DB config set to prod (wastenotglobal)');

    const loginPage = new LoginPage(page);
    await loginPage.goto(process.env.GLOBAL_PROD_URL);
    await loginPage.assertPageLoaded();
    await loginPage.login(process.env.GP_ADMIN_USERNAME, process.env.GP_ADMIN_PASSWORD);
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
