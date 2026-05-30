import { queryDatabase } from './db.js';
import { BamcoPage } from '../Page/BamcoPage.js';

// ── Date Helpers (exported so Compass spec can reuse) ──────────────────────────

export function formatDate(date, isEnd = false) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d} ${isEnd ? '23:59:59' : '00:00:00'}`;
}

/**
 * Build standard date ranges used across Bamco and Compass specs.
 * @param {{ useYesterdayAsCurrentEnd?: boolean }} [opts]
 *   - useYesterdayAsCurrentEnd: Compass uses yesterday; Bamco uses last day of month
 */
export function buildDateRanges({ useYesterdayAsCurrentEnd = false } = {}) {
    const now = new Date();
    const currentMonthEnd = useYesterdayAsCurrentEnd
        ? new Date(new Date().setDate(new Date().getDate() - 1))
        : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
        past6MonthsStartDate  : formatDate(new Date(now.getFullYear(), now.getMonth() - 6, 1)),
        past6MonthsEndDate    : formatDate(new Date(now.getFullYear(), now.getMonth(), 0),         true),
        currentMonthStartDate : formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        currentMonthEndDate   : formatDate(currentMonthEnd,                                        true),
        lastYearStartDate     : formatDate(new Date(now.getFullYear() - 1, now.getMonth(), 1)),
        lastYearEndDate       : formatDate(new Date(now.getFullYear() - 1, now.getMonth() + 1, 0), true),
    };
}

// ── Query Builders (exported so Compass spec can reuse) ────────────────────────

export function past6MonthsQuery(campusId, start, end) {
    return `
    WITH plate_only_days AS (
        SELECT DATE(created_at) AS waste_date
        FROM ot_tablet_profile
        WHERE created_at BETWEEN '${start}' AND '${end}' AND campus_id = '${campusId}'
        GROUP BY DATE(created_at)
        HAVING COUNT(DISTINCT kind_of_waste) = 1 AND MAX(kind_of_waste) = 'plate_waste'
    ),
    filtered_data AS (
        SELECT EXTRACT(YEAR FROM created_at) AS year, EXTRACT(MONTH FROM created_at) AS month,
               DATE(created_at) AS day, lbs_waste
        FROM ot_tablet_profile
        WHERE kind_of_waste != 'plate_waste'
          AND created_at BETWEEN '${start}' AND '${end}' AND campus_id = '${campusId}'
          AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days)
    ),
    monthly_aggregates AS (
        SELECT year, month,
               SUM(lbs_waste) AS total_lbs_waste, COUNT(DISTINCT day) AS total_days,
               SUM(lbs_waste) / COUNT(DISTINCT day) AS avg_lbs_per_day
        FROM filtered_data GROUP BY year, month HAVING COUNT(DISTINCT day) >= 12
    ),
    overall_totals AS (
        SELECT ROUND(SUM(total_lbs_waste) / SUM(total_days), 2) AS overall_avg_lbs_per_day
        FROM monthly_aggregates
    )
    SELECT m.*, o.overall_avg_lbs_per_day
    FROM monthly_aggregates m CROSS JOIN overall_totals o ORDER BY m.year, m.month;`;
}

export function singleMonthQuery(campusId, start, end) {
    return `
    WITH plate_only_days AS (
        SELECT DATE(created_at) AS waste_date
        FROM ot_tablet_profile
        WHERE created_at BETWEEN '${start}' AND '${end}' AND campus_id = '${campusId}'
        GROUP BY DATE(created_at)
        HAVING COUNT(DISTINCT kind_of_waste) = 1 AND MAX(kind_of_waste) = 'plate_waste'
    )
    SELECT SUM(lbs_waste) AS total_lbs_waste,
           COUNT(DISTINCT DATE(created_at)) AS total_days,
           SUM(lbs_waste) / COUNT(DISTINCT DATE(created_at)) AS avg_lbs_per_day
    FROM ot_tablet_profile
    WHERE kind_of_waste != 'plate_waste'
      AND created_at BETWEEN '${start}' AND '${end}' AND campus_id = '${campusId}'
      AND DATE(created_at) NOT IN (SELECT waste_date FROM plate_only_days);`;
}

// ── Shared DB query runner ─────────────────────────────────────────────────────

/**
 * Run the 3 standard waste queries (past 6 months, current month, last year)
 * in parallel and return rounded lbs values ready for assertion.
 *
 * @param {string|number} campusId
 * @param {object}        dates    - output of buildDateRanges()
 * @param {object}        dbConfig
 * @returns {{ dbPast6Months: number, dbCurrentMonth: number, dbLastYear: number }}
 */
export async function runWasteQueries(campusId, dates, dbConfig) {
    const [past6Result, currentResult, lastYearResult] = await Promise.all([
        queryDatabase(past6MonthsQuery(campusId, dates.past6MonthsStartDate,  dates.past6MonthsEndDate),  dbConfig),
        queryDatabase(singleMonthQuery(campusId, dates.currentMonthStartDate, dates.currentMonthEndDate), dbConfig),
        queryDatabase(singleMonthQuery(campusId, dates.lastYearStartDate,     dates.lastYearEndDate),     dbConfig),
    ]);

    const dbPast6Months  = Math.round(past6Result[0]?.overall_avg_lbs_per_day || 0);
    const dbCurrentMonth = Math.round(currentResult[0]?.avg_lbs_per_day       || 0);
    const dbLastYear     = Math.round(lastYearResult[0]?.avg_lbs_per_day      || 0);

    console.log(`DB → Past6Months: ${dbPast6Months}, CurrentMonth: ${dbCurrentMonth}, LastYear: ${dbLastYear}`);
    return { dbPast6Months, dbCurrentMonth, dbLastYear };
}

// ── Bamco shared test body ─────────────────────────────────────────────────────

/**
 * Full Dashboard & Iframe test logic, shared by UI_Bamco_Dev and UI_Bamco_Prod.
 * @param {import('@playwright/test').Page} page
 * @param {object} dbConfig
 * @param {{ campusName: string, iframeWait: number }} env
 */
export async function runDashboardAndIframeTest(page, dbConfig, env) {
    const bamco = new BamcoPage(page);

    await bamco.navigateToWasteNot();
    await bamco.assertFiltersVisible();
    await bamco.assertFilterButtonsVisible();

    await bamco.waitForIframe(env.iframeWait);
    await bamco.assertIframeElementsVisible();

    await bamco.selectRegion('Joseph Alfieri');
    await bamco.clearAllFilters();

    console.log(`Selecting campus: ${env.campusName}`);
    await bamco.selectCampus(env.campusName);

    // Resolve campus_id
    const campusResult = await queryDatabase(
        `SELECT location_id FROM accounts_locations WHERE name = '${env.campusName}' LIMIT 1;`,
        dbConfig
    );
    const campusId = campusResult[0]?.location_id;
    if (!campusId) throw new Error(`Campus ID not found for: ${env.campusName}`);
    console.log(`Campus ID resolved: ${campusId}`);

    const dates = buildDateRanges();
    console.log(dates);

    const { dbPast6Months, dbCurrentMonth, dbLastYear } = await runWasteQueries(campusId, dates, dbConfig);

    await page.waitForTimeout(5000);

    await bamco.assertIframeLbsValue(dbPast6Months,  'Past 6 Months');
    await bamco.assertIframeLbsValue(dbCurrentMonth, 'Current Month', true);
    await bamco.assertIframeLbsValue(dbLastYear,     'Last Year');
}