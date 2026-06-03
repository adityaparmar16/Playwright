import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { LoginPage, DashboardPage, ReportsPage, getDashboardDateRanges, getEntityUnitIdCaseInsensitive, fetchDashboardMetrics } from '../../../Page/index.js';

const EMAIL_ID  = 'aditya.parmar@ccube.com';
const SCHEDULES = [
  { type: 'Everyday', timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Monday',    timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Wednesday', timezone: 'Eastern Standard Time' },
];

test.describe('Dashboard Validation – Unit Admin | Production', () => {
  let dbConfig;

  test.beforeEach(async ({ page }, testInfo) => {
    dbConfig = { ...testInfo.config.metadata.globalprod, database: 'wastenotglobal' };
    console.log('DB config set to prod (wastenotglobal)');

    const loginPage = new LoginPage(page);
    await loginPage.goto(process.env.GLOBAL_PROD_URL);
    await loginPage.assertPageLoaded();
    await loginPage.login(process.env.GP_UNIT_USERNAME, process.env.GP_UNIT_PASSWORD);
  });

  test('Validate Dashboard DB vs UI', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const reports   = new ReportsPage(page);

    await dashboard.navigateToDashboard();

    // Unit name + id_number are read dynamically from the UI for this role
    const { unitName, idNumber } = await dashboard.getUnitDetailsFromUI();
    console.log('Unit Name:', unitName, 'ID Number:', idNumber);

    await dashboard.selectImperial();

    const entityUnitId = await getEntityUnitIdCaseInsensitive(unitName, idNumber, dbConfig);
    const dateRanges   = getDashboardDateRanges();
    console.log(dateRanges);

    const dbValues = await fetchDashboardMetrics(entityUnitId, dateRanges, dbConfig);
    await dashboard.assertChartValues(dbValues);

    await reports.createAllSchedules(EMAIL_ID, SCHEDULES);
    await reports.sendNow(EMAIL_ID);
  });
});
