import { test } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

import { testData } from '../../../utils/testData.js';
import { getCompassAdmins } from '../../../utils/compassAdmins.js';
import { runCompassFlow } from '../../../utils/compassFlow.js';

const ENV    = 'STAG';
const ADMINS = getCompassAdmins(ENV); // admin1 = current global admin; add more in .env (see utils/compassAdmins.js)

test.describe('WasteNot - Complex DB Validation', () => {
    // One admin after another in the same browser worker – each needs its own OTP, so no parallel logins
    test.describe.configure({ mode: 'default' });

    let dbConfig;

    test.beforeEach(async ({}, testInfo) => {
        dbConfig = { ...testInfo.config.metadata.dbstag, database: testData.wntDbName };
    });

    if (!ADMINS.length) {
        test('Compass admins configured', () => {
            throw new Error('No Compass admins found – set WASTENOT_LOGIN_ID or COMPASS_ADMIN1_LOGIN_ID in .env (COMPASS_ADMINS filter may exclude all)');
        });
    }

    for (const admin of ADMINS) {
        test(`${{ dashboard: 'Login + dashboard', login: 'Login + tracking calendar', calendar: 'Login + tracking calendar + cost center', full: 'Validate UI data with DB for Complex' }[admin.mode]}${admin.mode !== 'full' && admin.sendNow ? ' + Send Now' : ''} – ${admin.key} (${admin.label})`, async ({ page }) => {
            test.setTimeout(360000);

            await runCompassFlow({
                page,
                admin,
                url             : process.env.COMPASS_STAGING_URL,
                dbConfig,
                reportEmail     : testData.reportEmail,
                nowSubject      : `Compass - Now Report via Automation – ${admin.label}`,
                scheduleSubject : `Scheduled Report via Automation – ${admin.label}`,
            });
        });
    }
});
