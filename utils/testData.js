import dotenv from 'dotenv';
dotenv.config();

/**
 * Central test data. Every value can be overridden from .env;
 * the defaults below are the values the specs used before.
 */
const get = (name, fallback) => {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
};

const DEFAULT_SCHEDULES = [
  { type: 'Everyday', timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Monday',    timezone: 'Central European Standard Time' },
  { type: 'Weekly',   day: 'Wednesday', timezone: 'Eastern Standard Time' },
];

function parseSchedules() {
  const raw = process.env.WNG_SCHEDULES_JSON;
  if (!raw) return DEFAULT_SCHEDULES;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn('WNG_SCHEDULES_JSON is not valid JSON – using default schedules');
    return DEFAULT_SCHEDULES;
  }
}

export const testData = {
  get,

  /** Email that receives Send Now / scheduled reports */
  reportEmail: get('REPORT_EMAIL', 'aditya.parmar@ccube.com'),

  /** DB schema names */
  wngDbName: get('WNG_DB_NAME', 'wastenotglobal'),
  wntDbName: get('WNT_DB_NAME', 'cafemanager'),

  /** Schedules created by the WNG Reports tests */
  schedules: parseSchedules(),

  /**
   * WNG unit name. Looks up WNG_<ENV>_<ROLE>_UNIT_NAME, then WNG_<ENV>_UNIT_NAME, then the fallback.
   * e.g. unitName('PROD', 'GLOBALADMIN', 'Asyaport')
   */
  unitName(env, role, fallback) {
    return get(`WNG_${env}_${role}_UNIT_NAME`, get(`WNG_${env}_UNIT_NAME`, fallback));
  },

  /** Compass complex: COMPASS_<ENV>_COMPLEX_ID, then COMPASS_COMPLEX_ID, then the fallback */
  complexId(env, fallback = 'C-58001') {
    return get(`COMPASS_${env}_COMPLEX_ID`, get('COMPASS_COMPLEX_ID', fallback));
  },
};
