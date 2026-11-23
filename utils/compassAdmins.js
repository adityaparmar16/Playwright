// utils/compassAdmins.js
// The Compass admin accounts the Compass UI specs run as, read from .env.
//
// Add one block per admin (admin1, admin2, ... up to admin20):
//   COMPASS_ADMIN2_LABEL="School Division admin"
//   COMPASS_ADMIN2_LOGIN_ID=...            # required – the Compass "Login ID"
//   COMPASS_ADMIN2_PASSWORD=...            # optional – defaults to WASTENOT_PASSWORD
//   COMPASS_ADMIN2_MFA_HINT=1234|34        # optional – last digits of the SMS phone, defaults to MFA_PHONE_HINT
//   COMPASS_ADMIN2_OTP=...                 # optional – defaults to WASTENOT_OTP (empty = enter OTP manually)
//   COMPASS_ADMIN2_COMPLEX_ID=C-12345      # optional – complex this admin can see, defaults to COMPASS_COMPLEX_ID
//   COMPASS_ADMIN2_MODE=login              # optional – what to run for this admin (default "full"):
//                                          #   dashboard = sign in and reach the dashboard only (access not known yet)
//                                          #   login    = sign in + tracking calendar + waste trend UI vs DB
//                                          #   calendar = login + tracking calendar + waste trend UI vs DB
//                                          #              + a cost center with a kitchen set up
//                                          #   (admins with a Complex filter need COMPLEX_ID for the calendar)
//                                          #   full     = everything: complex, calendar, DB vs UI lbs, reports, cost center
//   COMPASS_ADMIN2_EXPECT_TEXT="CCC ADMIN" # optional – text that must appear after login (e.g. the access breadcrumb)
//   COMPASS_ADMIN2_WASTE_TREND=false       # optional – skip the Waste Trend check (login/calendar modes)
//   COMPASS_ADMIN2_SEND_NOW=true           # optional – also send a "Now" report (login/calendar modes;
//                                          #   full mode always sends one). No scheduled report is created.
//
// Any of these can differ per environment by adding DEV / STAG / PROD after the number, e.g.
//   COMPASS_ADMIN2_PROD_LOGIN_ID=...  or  COMPASS_ADMIN2_DEV_COMPLEX_ID=C-99999
//
// admin1 falls back to the existing WASTENOT_LOGIN_ID / WASTENOT_PASSWORD, so the current global admin
// keeps working without any new settings.
//
// Run only some admins:  COMPASS_ADMINS=admin1,admin3 npx playwright test tests/WNT/UI/CompassProdPOM.spec.js

import { testData } from './testData.js';

const MAX_ADMINS = 20;

/**
 * @param {'DEV'|'STAG'|'PROD'} env
 * @returns {{ key, label, loginId, password, mfaHint, otp, complexId, mode, expectText }[]}
 */
export function getCompassAdmins(env) {
  const { get } = testData;
  const admins = [];

  for (let i = 1; i <= MAX_ADMINS; i++) {
    const p = `COMPASS_ADMIN${i}_`;
    // env-specific value first (COMPASS_ADMIN2_PROD_X), then the general one (COMPASS_ADMIN2_X), then the fallback
    const val = (name, fallback) => get(`${p}${env}_${name}`, get(`${p}${name}`, fallback));

    const loginId = val('LOGIN_ID', i === 1 ? process.env.WASTENOT_LOGIN_ID : undefined);
    if (!loginId) continue; // admin not configured

    admins.push({
      key: `admin${i}`,
      label: val('LABEL', i === 1 ? 'Global admin' : `Admin ${i}`),
      loginId,
      password: val('PASSWORD', process.env.WASTENOT_PASSWORD),
      mfaHint: val('MFA_HINT', process.env.MFA_PHONE_HINT || '6968|68'),
      otp: val('OTP', process.env.WASTENOT_OTP),
      complexId: val('COMPLEX_ID', testData.complexId(env)),
      // true only when this admin has its own real complex code (C-12345) – needed for the waste trend DB check
      complexIdSet: /^C-\d+$/i.test(String(val('COMPLEX_ID', '')).trim()),
      // COMPASS_ADMINn_WASTE_TREND=false skips the Waste Trend check for this admin (login/calendar modes)
      wasteTrend: String(val('WASTE_TREND', 'true')).toLowerCase() !== 'false',
      // COMPASS_ADMINn_SEND_NOW=true sends a "Now" report in login/calendar modes (full mode always does)
      sendNow: String(val('SEND_NOW', 'false')).toLowerCase() === 'true',
      mode: ['dashboard', 'login', 'calendar'].includes(String(val('MODE', 'full')).toLowerCase())
        ? String(val('MODE')).toLowerCase() : 'full',
      expectText: val('EXPECT_TEXT', ''),
    });
  }

  const only = (process.env.COMPASS_ADMINS || '')
    .split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return only.length ? admins.filter((a) => only.includes(a.key)) : admins;
}
