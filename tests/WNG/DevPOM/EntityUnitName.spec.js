import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { LoginPage, DashboardPage, ReportsPage, getDashboardDateRanges, getEntityUnitId, fetchDashboardMetrics } from '../../../Page/GlobalPage.js';

const UNIT_NAME = 'abbb';
const EMAIL_ID  = 'aditya.parmar@ccube.com';
const SCHEDULES = [
  { type: 'Everyday', timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Monday',    timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Wednesday', timezone: 'Eastern Standard Time' },
];

test.describe('Dashboard Validation – Entity (Unit Name)', () => {
  let dbConfig;

  test.beforeEach(async ({ page }, testInfo) => {
    dbConfig = { ...testInfo.config.metadata.globaldev, database: 'wastenotglobal' };
    console.log('DB config set to dev (wastenotglobal)');

    const loginPage = new LoginPage(page);
    await loginPage.goto(process.env.GLOBAL_DEV_URL);
    await loginPage.assertPageLoaded();
    await loginPage.login(process.env.GD_ENTITY_USERNAME, process.env.GD_ENTITY_PASSWORD);
  });

  test('Validate Dashboard DB vs UI', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const reports   = new ReportsPage(page);

    await dashboard.navigateToDashboard();
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
