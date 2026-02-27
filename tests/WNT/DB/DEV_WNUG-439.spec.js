import { test } from '@playwright/test';
import { queryDatabase } from '../../../utils/db.js';
import fs from 'fs';
import path from 'path';

// Format Date to "YYYY-MM-DD HH:mm:ss"
function formatDateTime(dt) {
  const z = (n) => String(n).padStart(2, '0');
  const Y = dt.getFullYear();
  const M = z(dt.getMonth() + 1);
  const D = z(dt.getDate());
  const h = z(dt.getHours());
  const m = z(dt.getMinutes());
  const s = z(dt.getSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

// Convert query result to CSV
function convertToCSV(rows) {
  if (!rows || rows.length === 0) return '';

  const headers = Object.keys(rows[0]);

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) v = v.toISOString();
    v = String(v);
    if (v.includes('"')) v = v.replace(/"/g, '""');
    if (v.includes(',') || v.includes('\n') || v.includes('"')) return `"${v}"`;
    return v;
  };

  const headerLine = headers.join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escape(row[h])).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

// Save CSV to test-results folder
function saveCsv(fileName, csv) {
  const dir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, csv, 'utf8');
  return filePath;
}

test.describe('Manual Date Range Duplicate Records Check (with update)', () => {
  test('find duplicates, update duplicate ids (lbs/container/app_date), and save CSVs', async ({}, testInfo) => {
    const dbConfig = testInfo.project.metadata?.dbdevWrite;
    if (!dbConfig) throw new Error('DB config not found: metadata.dbdev');

    // MANUALLY SET START & END DATE HERE
    const startDate = '2026-03-01 00:00:00';
    const endDate   = '2026-03-31 23:59:59';

    // 1) Run GROUP_CONCAT duplicate detection query
    const groupSql = `
      SELECT
        GROUP_CONCAT(id) AS ids,
        COUNT(id) AS total,
        tablet_id,
        profile_id,
        campus_id,
        updated_at,
        kitchen_id,
        created_at,
        kind_of_waste,
        lbs_waste,
        waste_destination,
        container_type,
        app_date
      FROM cafemanager.ot_tablet_profile
      GROUP BY tablet_id, profile_id, campus_id, kitchen_id, created_at, kind_of_waste,
               lbs_waste, waste_destination, container_type
      HAVING total > 1
        AND created_at >= '${startDate}'
        AND created_at <= '${endDate}';
    `;

    let groupRows;
    try {
      groupRows = await queryDatabase(groupSql, dbConfig);
    } catch (err) {
      throw new Error('Group query execution failed: ' + (err?.message || err));
    }

    // Save the GROUP_CONCAT result CSV (even if empty)
    const groupCsv = convertToCSV(groupRows || []);
    const groupFileName = `duplicates_${startDate.split(' ')[0]}_to_${endDate.split(' ')[0]}.csv`;
    const groupFilePath = saveCsv(groupFileName, groupCsv);
    console.log(`GROUP_CONCAT query executed. CSV saved at: ${groupFilePath}`);

    // 2) Parse duplicate ids (all ids except the first in each GROUP_CONCAT)
    const duplicateIdSet = new Set();

    if (groupRows && groupRows.length) {
      for (const row of groupRows) {
        const idsValue = row.ids || row.IDs || row.Id || row.id || '';
        if (!idsValue) continue;
        const parts = String(idsValue).split(',').map(p => p.trim()).filter(p => p !== '');
        if (parts.length <= 1) continue;
        for (let i = 1; i < parts.length; i++) {
          duplicateIdSet.add(parts[i]);
        }
      }
    }

    if (duplicateIdSet.size === 0) {
      console.log('No duplicate ids (beyond the primary id) found. No update will be executed.');
      return;
    }

    // Prepare IDs for SQL (keep numeric ids unquoted)
    const duplicateIdsArr = Array.from(duplicateIdSet);
    const formattedIds = duplicateIdsArr.map(id => /^[0-9]+$/.test(String(id)) ? String(id) : `'${String(id).replace(/'/g, "''")}'`).join(',');

    // 3) Compute app_date = now + 48 hours
    const now = new Date();
    const future = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const appDateStr = formatDateTime(future);

    // 4) Run UPDATE for all duplicate ids
    const updateSql = `
      UPDATE cafemanager.ot_tablet_profile
      SET lbs_waste = '0.00 lbs',
          container_fill_level = 0,
          app_date = '${appDateStr}'
      WHERE id IN (${formattedIds});
    `;

    try {
      await queryDatabase(updateSql, dbConfig);
      console.log(`UPDATE executed for ${duplicateIdSet.size} ids. app_date set to ${appDateStr}`);
    } catch (err) {
      // save error CSV and throw
      const errCsv = `error\n${String(err?.message || err)}`;
      const errorFileName = `update_error_${Date.now()}.csv`;
      saveCsv(errorFileName, errCsv);
      throw new Error(`Update failed: ${err?.message || err}. Error CSV saved: ${errorFileName}`);
    }

    // 5) Select updated rows for verification and save CSV
    const selectUpdatedSql = `
      SELECT *
      FROM cafemanager.ot_tablet_profile
      WHERE id IN (${formattedIds});
    `;

    let updatedRows;
    try {
      updatedRows = await queryDatabase(selectUpdatedSql, dbConfig);
    } catch (err) {
      const errCsv = `error\n${String(err?.message || err)}`;
      const errorFileName = `select_updated_error_${Date.now()}.csv`;
      saveCsv(errorFileName, errCsv);
      throw new Error(`Selecting updated rows failed: ${err?.message || err}. Error CSV saved: ${errorFileName}`);
    }

    const updatedCsv = convertToCSV(updatedRows || []);
    const updatedFileName = `updated_duplicates_${startDate.split(' ')[0]}_to_${endDate.split(' ')[0]}_${Date.now()}.csv`;
    const updatedFilePath = saveCsv(updatedFileName, updatedCsv);

    console.log(`Updated rows selected and CSV saved at: ${updatedFilePath}`);
  });
});
