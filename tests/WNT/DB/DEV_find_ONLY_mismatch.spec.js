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

const summary = {
  mismatchCount: 0,
  kitchensWithMismatches: new Set(),
  errors: []
};

test.describe('Find COMPLEX (C-*) mismatches between ot_tablet_profile and ot_kitchen', () => {
  test('Detect only C-* mismatches and save to CSV', async ({}, testInfo) => {
    try {
      const dbConfig = testInfo.project.metadata?.dbdev;
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const resultsDir = path.join(process.cwd(), 'test-results');
      fs.mkdirSync(resultsDir, { recursive: true });

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
          AND NOT (tp.campus_id <=> k.complex_id)
        ORDER BY tp.kitchen_id, tp.created_at DESC;
      `;

      const mismatches = await queryDatabase(mismatchQuery, dbConfig);

      summary.mismatchCount = mismatches?.length || 0;

      mismatches?.forEach(row => {
        if (row.kitchen_id != null) {
          summary.kitchensWithMismatches.add(String(row.kitchen_id));
        }
      });

      const csvName = `C_complex_mismatches_dev_${timestamp}.csv`;
      fs.writeFileSync(
        path.join(resultsDir, csvName),
        convertToCSV(mismatches)
      );

      console.log(
        `Found ${summary.mismatchCount} COMPLEX mismatched rows ` +
        `across ${summary.kitchensWithMismatches.size} kitchens.`
      );
      console.log(`CSV written to test-results/${csvName}`);
    } catch (err) {
      summary.errors.push(String(err));
      console.error('Error while finding complex mismatches:', err);
    }
  });

  test.afterAll(() => {
    console.log('\n=== COMPLEX MISMATCH SUMMARY ===');
    console.log('Total mismatched rows:', summary.mismatchCount);
    console.log(
      'Kitchens with mismatches:',
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
