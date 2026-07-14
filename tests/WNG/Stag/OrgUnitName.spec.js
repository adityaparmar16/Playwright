import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { LoginPage, DashboardPage, ReportsPage, getDashboardDateRanges, getEntityUnitId, fetchDashboardMetrics } from '../../../Page/GlobalPage.js';

const UNIT_NAME = 'Sejal Unit 01';
const EMAIL_ID  = 'aditya.parmar@ccube.com';
const SCHEDULES = [
  { type: 'Everyday', timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Monday',    timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Wednesday', timezone: 'Eastern Standard Time' },
];

test.describe('Dashboard Validation – Org (Unit Name)', () => {
  let dbConfig;

  test.beforeEach(async ({ page }, testInfo) => {
    dbConfig = { ...testInfo.config.metadata.globalstag, database: 'wastenotglobal' };
    console.log('DB config set to stag (wastenotglobal)');

    const loginPage = new LoginPage(page);
    await loginPage.goto(process.env.GLOBAL_STAG_URL);
    await loginPage.assertPageLoaded();
    await loginPage.login(process.env.GS_ORG_USERNAME, process.env.GS_ORG_PASSWORD);
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
