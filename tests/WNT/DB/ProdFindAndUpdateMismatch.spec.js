import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import { csv, save } from "../../../utils/dbReport.js";

/**
 * Finds tablet profiles whose campus_id (C-*) doesn't match their kitchen's complex_id.
 *
 * Dry run by default — only finds and saves a CSV:
 *   npx playwright test ProdFindAndUpdateMismatch --project=chromium
 *
 * To also fix them (updates prod):
 *   CONFIRM_FIX=true npx playwright test ProdFindAndUpdateMismatch --project=chromium
 *
 * (Replaces ProdFindOnlyMismatch.spec.js, which was this script's find step on its own.)
 */

const q = `
SELECT tp.id,tp.kitchen_id,tp.campus_id,k.complex_id,tp.created_at
FROM cafemanager.ot_tablet_profile tp
JOIN cafemanager.ot_kitchen k ON tp.kitchen_id=k.id
WHERE tp.campus_id LIKE 'C-%'
AND k.complex_id LIKE 'C-%'
AND NOT(tp.campus_id<=>k.complex_id)
ORDER BY tp.kitchen_id,tp.created_at DESC
`;


test("Fix C-* mismatches", async ({}, testInfo) => {

  const read = testInfo.project.metadata?.dbproduction,
        write = testInfo.project.metadata?.dbproductionWrite || read,
        confirm = process.env.CONFIRM_FIX === "true",
        t = Date.now();

  const before = await queryDatabase(q, read);

  const beforeFile = save(`mismatches_before_${t}.csv`, csv(before));

  console.log(`
    Mismatches: ${before.length}
    Kitchens: ${[...new Set(before.map(x => x.kitchen_id))].join(",") || "None"}
    CSV: ${beforeFile}
  `);

  if (!before.length) return console.log("No mismatches");

  if (!confirm) {
    console.log(`
    Dry run only — no changes made.
    Review the CSV, then re-run with CONFIRM_FIX=true to update.
    `);
    return;
  }

  await queryDatabase(`
    UPDATE cafemanager.ot_tablet_profile tp
    JOIN cafemanager.ot_kitchen k ON tp.kitchen_id=k.id
    SET tp.campus_id=k.complex_id,
        tp.app_date=DATE_ADD(NOW(),INTERVAL 48 HOUR)
    WHERE tp.campus_id LIKE 'C-%'
    AND k.complex_id LIKE 'C-%'
    AND NOT(tp.campus_id<=>k.complex_id)
  `, write);

  const after = await queryDatabase(q, read);

  save(`mismatches_after_${t}.csv`, csv(after));

  console.log(`
    Before: ${before.length}
    After: ${after.length}
    Fixed: ${before.length - after.length}
  `);
});
