import {test} from '@playwright/test';
import {queryDatabase} from '../../../utils/db.js';

import fs from 'fs';
import path from 'path';

// Function to convert query result to CSV format
function convertToCSV(queryResult) {
  if (!queryResult || !queryResult.length) return '';
  const headers = Object.keys(queryResult[0]);
  const csvRows = queryResult.map(row =>
    headers.map(header => row[header]).join(',')
  );
  return [headers.join(','), ...csvRows].join('\n');
}

// List of kitchen IDs and corresponding expected campus IDs
const kitchenCampusMap = {
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
  '7712': 'C-58217',
  '7542': 'C-61177',
  '3786': 'C-12967',
  '4852': 'C-63572'
};

test.describe('Monday-specific_WNUG-438', () => {
  for (const [kitchenId, expectedCampusId] of Object.entries(kitchenCampusMap)) {
    test(`should have only the expected campus_id=${expectedCampusId} for kitchen_id=${kitchenId}`, async ({}, testInfo) => {
      // use production DB from config metadata
      const dbConfig = testInfo.project.metadata?.dbproduction;

      const result = await queryDatabase(
        `
          SELECT * 
          FROM cafebonappetit.ot_tablet_profile 
          WHERE kitchen_id='${kitchenId}' 
          ORDER BY created_at DESC;
        `,
        dbConfig
      );

      if (result && result.length) {
        // Convert to CSV
        const csv = convertToCSV(result);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const fileName = `query_result_kitchen_${kitchenId}_${timestamp}.csv`;
        const filePath = path.join(process.cwd(), 'test-results', fileName);

        // Validate campus_id
        const allCampusIdsMatch = result.every(
          row => row.campus_id === expectedCampusId
        );

        if (allCampusIdsMatch) {
          console.log(
            `All campus_id values for kitchen_id=${kitchenId} match expected value: ${expectedCampusId}`
          );

          // Ensure folder exists
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, csv);

          console.log(`CSV file "${fileName}" saved successfully in test-results/`);
        } else {
          const mismatchedCampusIds = result
            .filter(row => row.campus_id !== expectedCampusId)
            .map(row => row.campus_id);

          throw new Error(
            `Test failed for kitchen_id=${kitchenId}. Mismatched campus_id values: ${mismatchedCampusIds.join(
              ', '
            )}`
          );
        }
      } else {
        console.log(
          `No data found for kitchen_id='${kitchenId}'. CSV file was not created.`
        );
      }
    });
  }
});
