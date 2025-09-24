import {test} from '@playwright/test';
import { queryDatabase } from '../../../utils/db.js';

import fs from 'fs';
import path from 'path';

// to convert query result to CSV
function convertToCSV(queryResult) {
  if (!queryResult || !queryResult.length) return '';
  const headers = Object.keys(queryResult[0]);
  const csvRows = queryResult.map(row =>
    headers.map(header => row[header]).join(',')
  );
  return [headers.join(','), ...csvRows].join('\n');
}

// List of kitchen IDs-campus IDs
const kitchenCampusMap = {
  '7735': 'C-7967',
  '7218': 'C-7967',
  '7858': 'C-7967',
  '7713': 'C-7967',
  '7840': 'C-7967',
  '5046': 'C-58410',
  '5376': 'C-58410',
  '6251': 'C-58410',
  '6285': 'C-58410'
};

// Campus IDs to check only for absence of data
const campusOnlyList = [
  'C-50209',
  'C-50211'
];

test.describe('Monday-specific -> WNUG-550, WNUG-640 and WNUG-460', () => {
  // Kitchen-Campus validation
  for (const [kitchenId, expectedCampusId] of Object.entries(kitchenCampusMap)) {
    test(`should have only the expected campus_id=${expectedCampusId} for kitchen_id=${kitchenId}`, async ({}, testInfo) => {
      const dbConfig = testInfo.project.metadata?.dbproduction;

      //kitchen_id query
      const result = await queryDatabase(
        `
          SELECT * 
          FROM cafebonappetit.ot_tablet_profile 
          WHERE kitchen_id='${kitchenId}' 
          ORDER BY created_at DESC;
        `,
        dbConfig
      );

      //campus_id query
      const campusResult = await queryDatabase(
        `
          SELECT * 
          FROM cafebonappetit.ot_tablet_profile 
          WHERE campus_id='${expectedCampusId}' 
          ORDER BY created_at DESC;
        `,
        dbConfig
      );

      if (!campusResult || !campusResult.length) {
        throw new Error(
          `No data found for campus_id='${expectedCampusId}' in ot_tablet_profile`
        );
      } else {
        console.log(
          `Campus data exists for campus_id='${expectedCampusId}', rows=${campusResult.length}`
        );
      }

      if (result && result.length) {
        // Convert to CSV
        const csv = convertToCSV(result);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const fileName = `query_result_kitchen_${kitchenId}_${timestamp}.csv`;
        const filePath = path.join(process.cwd(), 'downloads', fileName);

        // Validate campus_id
        const allCampusIdsMatch = result.every(
          row => row.campus_id === expectedCampusId
        );

        if (allCampusIdsMatch) {
          console.log(
            `All campus_id values for kitchen_id=${kitchenId} match expected value: ${expectedCampusId}`
          );

          //to check if folder exists
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, csv);

          console.log(`CSV file "${fileName}" saved successfully in downloads/`);
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

  //Campus validation to check if data is present
  for (const campusId of campusOnlyList) {
    test(`should have NO data in ot_tablet_profile for campus_id=${campusId}`, async ({}, testInfo) => {
      const dbConfig = testInfo.project.metadata?.dbproduction;

      const campusResult = await queryDatabase(
        `
          SELECT * 
          FROM cafebonappetit.ot_tablet_profile 
          WHERE campus_id='${campusId}' 
          ORDER BY created_at DESC;
        `,
        dbConfig
      );

      if (!campusResult || !campusResult.length) {
        console.log(
          `No data found for campus_id='${campusId}', test passed as expected`
        );
      } else {
        throw new Error(
          `Unexpected data found for campus_id='${campusId}', rows=${campusResult.length}`
        );
      }
    });
  }
});
