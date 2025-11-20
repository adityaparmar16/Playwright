import { test } from '@playwright/test';
import { queryDatabase } from '../../../utils/db.js';

import fs from 'fs';
import path from 'path';

// Function to convert query result to CSV format
function convertToCSV(queryResult) {
  if (!queryResult || !queryResult.length) return '';
  const headers = Object.keys(queryResult[0]);
  const csvRows = queryResult.map(row =>
    headers
      .map(header => {
        const val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  return [headers.join(','), ...csvRows].join('\n');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function getAppDateDaysAhead(daysAhead, timeOfDay = '10:00:08') {
  const todayInIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = todayInIST.split('-').map(Number);

  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + daysAhead);

  const year = dt.getUTCFullYear();
  const month = pad(dt.getUTCMonth() + 1);
  const day = pad(dt.getUTCDate());

  return `${year}-${month}-${day} ${timeOfDay}`;
}

// Kitchen → expected complex
const expectedComplexMap = {
  '1730': 'C-40575',
  '2320': 'C-66795',
  '2775': 'C-56365',
  '3320': 'C-30452',
  '3324': 'C-30452',
  '3555': 'C-1295',
  '4181': 'C-19325',
  '4849': 'C-63572',
  '4790': 'C-68977',
  '5093': 'C-61177',
  '5112': 'C-61177',
  '5114': 'C-61177',
  '5522': 'C-68977',
  '5770': 'C-57454',
  '6732': 'C-65066',
  '6890': 'C-64819',
  '7027': 'C-65066',
  '7164': 'C-57454',
  '7404': 'C-65066',
  '7480': 'C-65066',
  '7540': 'C-65066',
  '7542': 'C-61177',
  '3683': 'C-12967',
  '3786': 'C-12967',
  '4852': 'C-63572'
};

// Old campus values for initial SELECT
const oldCampusMap = {
  '4790': 'C-30247',
  '3320': 'C-30841',
  '3324': 'C-30817',
  '4181': 'C-25389',
  '6890': 'C-46181',
  '5093': 'C-61176',
  '5114': 'C-61176',
  '2320': 'C-53021',
  '3555': 'C-1296',
  '5770': 'C-57455',
  '7164': 'C-57455',
  '7027': 'C-65069',
  '7540': 'C-65070',
  '6732': 'C-65071',
  '7404': 'C-65067',
  '7480': 'C-65068',
  '1730': 'C-31715',
  '2775': 'C-55523',
  '5522': 'C-18500',
  '5112': 'C-1815',
  '4849': 'C-61823',
  '7542': null, // special: != expected complex
  '3683': 'C-55323',
  '3786': 'C-40346',
  '4852': 'C-61823'
};

// Summary tracking
const summary = {
  updated: [],
  skippedNoRows: [],
  skippedKitchenMismatch: [],
  skippedNoKitchenRow: [],
  errors: []
};

test.describe('WNUG-438 bulk campus corrections', () => {
  for (const [kitchenId, expectedComplexId] of Object.entries(expectedComplexMap)) {
    test(`Fix kitchen ${kitchenId}`, async ({}, testInfo) => {
      try {
        const dbConfig = testInfo.project.metadata?.dbproductionWrite;
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const resultsDir = path.join(process.cwd(), 'test-results');
        fs.mkdirSync(resultsDir, { recursive: true });

        const oldCampusId = oldCampusMap[kitchenId];

        // Build initial SELECT
        let selectQuery;
        if (kitchenId === '7542') {
          selectQuery = `
            SELECT * FROM cafebonappetit.ot_tablet_profile
            WHERE kitchen_id='${kitchenId}' AND campus_id != '${expectedComplexId}'
            ORDER BY created_at DESC;
          `;
        } else {
          selectQuery = `
            SELECT * FROM cafebonappetit.ot_tablet_profile
            WHERE campus_id='${oldCampusId}' AND kitchen_id='${kitchenId}'
            ORDER BY created_at DESC;
          `;
        }

        // 1) Run SELECT
        const rows = await queryDatabase(selectQuery, dbConfig);
        const selectCsvName = `select_k${kitchenId}_${timestamp}.csv`;
        fs.writeFileSync(path.join(resultsDir, selectCsvName), convertToCSV(rows));

        if (!rows || rows.length === 0) {
          summary.skippedNoRows.push(kitchenId);
          console.log(`Skipping ${kitchenId}: no rows found.`);
          return;
        }

        // 2) Validate ot_kitchen
        const kitchenQuery = `
          SELECT * FROM cafebonappetit.ot_kitchen WHERE id='${kitchenId}';
        `;
        const kitchenRows = await queryDatabase(kitchenQuery, dbConfig);
        fs.writeFileSync(path.join(resultsDir, `kitchen_${kitchenId}_${timestamp}.csv`), convertToCSV(kitchenRows));

        if (!kitchenRows || kitchenRows.length === 0) {
          summary.skippedNoKitchenRow.push(kitchenId);
          console.log(`Skipping ${kitchenId}: no kitchen row.`);
          return;
        }

        const actualComplex = kitchenRows[0].complex_id;

        if (actualComplex !== expectedComplexId) {
          summary.skippedKitchenMismatch.push(kitchenId);
          console.log(`Skipping ${kitchenId}: complex mismatch (${actualComplex} != ${expectedComplexId})`);
          return;
        }

        // 3) Perform UPDATE
        const newAppDate = getAppDateDaysAhead(2, '10:00:08');

        let updateWhere;
        if (kitchenId === '7542') {
          updateWhere = `kitchen_id='${kitchenId}' AND campus_id != '${expectedComplexId}'`;
        } else {
          updateWhere = `campus_id='${oldCampusId}' AND kitchen_id='${kitchenId}'`;
        }

        const updateQuery = `
          UPDATE cafebonappetit.ot_tablet_profile
          SET campus_id='${expectedComplexId}', app_date='${newAppDate}'
          WHERE ${updateWhere};
        `;

        const updateResult = await queryDatabase(updateQuery, dbConfig);

        summary.updated.push({ kitchenId, updateResult });

        // 4) Confirmation SELECT
        const confirmQuery = `
          SELECT *
          FROM cafebonappetit.ot_tablet_profile
          WHERE campus_id='${expectedComplexId}' AND kitchen_id='${kitchenId}'
          ORDER BY created_at DESC;
        `;
        const confirmRows = await queryDatabase(confirmQuery, dbConfig);
        fs.writeFileSync(
          path.join(resultsDir, `confirm_k${kitchenId}_${timestamp}.csv`),
          convertToCSV(confirmRows)
        );

        if (!confirmRows || confirmRows.length === 0) {
          summary.errors.push({ kitchenId, error: 'No rows after update' });
        }
      } catch (err) {
        summary.errors.push({ kitchenId, error: String(err) });
      }
    });
  }

  // SUMMARY
  test.afterAll(() => {
    console.log('\n=== FINAL SUMMARY ===');
    console.log('Updated:', summary.updated.map(x => x.kitchenId).join(', ') || 'None');
    console.log('Skipped – No Rows:', summary.skippedNoRows.join(', ') || 'None');
    console.log('Skipped – Kitchen Mismatch:', summary.skippedKitchenMismatch.join(', ') || 'None');
    console.log('Skipped – No Kitchen Row:', summary.skippedNoKitchenRow.join(', ') || 'None');

    if (summary.errors.length) {
      console.log('Errors:');
      summary.errors.forEach(e =>
        console.log(`  ${e.kitchenId}: ${e.error}`)
      );
    } else {
      console.log('Errors: None');
    }

    console.log('======================\n');
  });
});
