import { test } from '@playwright/test';
import { queryDatabase } from '../../../utils/db.js';
import fs from 'fs';
import path from 'path';

function convertToCSV(queryResult) {
  if (!queryResult || !queryResult.length) return '';
  const headers = Object.keys(queryResult[0]);
  const csvRows = queryResult.map(row =>
    headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
  );
  return [headers.join(','), ...csvRows].join('\n');
}

// Shared mismatch query: ONLY complexes starting with C-,
// compare ot_tablet_profile.campus_id vs ot_kitchen.complex_id
const mismatchQuery = `
  SELECT
    tp.id            AS tablet_profile_id,
    tp.tablet_id,
    tp.profile_id,
    tp.kitchen_id,
    tp.campus_id     AS tablet_complex_id,
    k.complex_id     AS kitchen_complex_id,
    tp.created_at
  FROM cafemanager.ot_tablet_profile tp
  JOIN cafemanager.ot_kitchen k
    ON tp.kitchen_id = k.id
  WHERE
    tp.campus_id LIKE 'C-%'
    AND k.complex_id LIKE 'C-%'
    AND NOT (tp.campus_id <=> k.complex_id)  -- NULL-safe inequality (MySQL/MariaDB)
  ORDER BY tp.kitchen_id, tp.created_at DESC;
`;

const summary = {
  mismatchCountBefore: 0,
  mismatchCountAfter: 0,
  updatedCount: 0,
  kitchensWithMismatches: new Set(),
  errors: []
};

test.describe('COMPLEX (C-*) campus fix using ot_kitchen.complex_id as source of truth', () => {
  test('Detect, update, and log C-* mismatches', async ({}, testInfo) => {
    try {
      const dbConfigRead = testInfo.project.metadata?.dbproduction;
      const dbConfigWrite = testInfo.project.metadata?.dbproductionWrite || dbConfigRead;
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const resultsDir = path.join(process.cwd(), 'test-results');
      fs.mkdirSync(resultsDir, { recursive: true });

      // 1) BEFORE: find mismatches and save CSV
      const mismatchesBefore = await queryDatabase(mismatchQuery, dbConfigRead);
      summary.mismatchCountBefore = mismatchesBefore?.length || 0;

      mismatchesBefore?.forEach(row => {
        if (row.kitchen_id != null) {
          summary.kitchensWithMismatches.add(String(row.kitchen_id));
        }
      });

      const beforeCsvName = `C_complex_mismatches_before_${timestamp}.csv`;
      fs.writeFileSync(
        path.join(resultsDir, beforeCsvName),
        convertToCSV(mismatchesBefore)
      );

      console.log(
        `Found ${summary.mismatchCountBefore} COMPLEX mismatched rows ` +
        `across ${summary.kitchensWithMismatches.size} kitchens.`
      );
      console.log(`Before-CSV written to test-results/${beforeCsvName}`);

      // If nothing to fix, stop here
      if (!summary.mismatchCountBefore) {
        console.log('No mismatches found. Skipping update.');
        return;
      }

      // 2) UPDATE: fix campus_id from ot_kitchen.complex_id, set app_date to 48 hours later
      const updateQuery = `
        UPDATE cafemanager.ot_tablet_profile tp
        JOIN cafemanager.ot_kitchen k
          ON tp.kitchen_id = k.id
        SET 
          tp.campus_id = k.complex_id,
          tp.app_date  = DATE_ADD(NOW(), INTERVAL 48 HOUR)
        WHERE
          tp.campus_id LIKE 'C-%'
          AND k.complex_id LIKE 'C-%'
          AND NOT (tp.campus_id <=> k.complex_id);
      `;

      const updateResult = await queryDatabase(updateQuery, dbConfigWrite);

      let updatedCount = 0;
      if (updateResult) {
        if (typeof updateResult.rowCount === 'number') {
          updatedCount = updateResult.rowCount;
        } else if (typeof updateResult.affectedRows === 'number') {
          updatedCount = updateResult.affectedRows;
        }
      }
      summary.updatedCount = updatedCount;

      console.log(`Updated ${summary.updatedCount} tablet_profile rows.`);

      // 3) AFTER: re-check mismatches and save CSV
      const mismatchesAfter = await queryDatabase(mismatchQuery, dbConfigRead);
      summary.mismatchCountAfter = mismatchesAfter?.length || 0;

      const afterCsvName = `C_complex_mismatches_after_${timestamp}.csv`;
      fs.writeFileSync(
        path.join(resultsDir, afterCsvName),
        convertToCSV(mismatchesAfter)
      );

      console.log(
        `After update there are ${summary.mismatchCountAfter} COMPLEX mismatched rows.`
      );
      console.log(`After-CSV written to test-results/${afterCsvName}`);
    } catch (err) {
      const msg = String(err);
      summary.errors.push(msg);
      console.error('Error during complex mismatch detect/update:', err);
    }
  });

  test.afterAll(() => {
    console.log('\n=== COMPLEX MISMATCH SUMMARY ===');
    console.log('Total mismatched rows BEFORE:', summary.mismatchCountBefore);
    console.log('Rows UPDATED:', summary.updatedCount);
    console.log('Total mismatched rows AFTER:', summary.mismatchCountAfter);
    console.log(
      'Kitchens with mismatches (before):',
      summary.kitchensWithMismatches.size
        ? Array.from(summary.kitchensWithMismatches).join(', ')
        : 'None'
    );
    console.log(
      'Errors:',
      summary.errors.length ? summary.errors.join(' | ') : 'None'
    );
    console.log('================================\n');
  });
});
