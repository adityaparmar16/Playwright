import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const MISMATCH_QUERY = `
SELECT
    cc.id AS costcenter_id,
    c.team_name AS complex_name,
    c.sector_name   AS complex_sector,   cc.sector_name   AS costcenter_sector,
    c.division_name AS complex_division, cc.division_name AS costcenter_division,
    c.region_name   AS complex_region,   cc.region_name   AS costcenter_region,
    c.district_name AS complex_district, cc.district_name AS costcenter_district
FROM cafemanager.wn_complex c
JOIN cafemanager.wn_costcenter cc ON c.team_name = cc.complex_name
WHERE
      c.sector_name <> cc.sector_name
   OR c.division_name <> cc.division_name
   OR c.region_name <> cc.region_name
   OR c.district_name <> cc.district_name
`;

const UPDATE_QUERY = `
UPDATE cafemanager.wn_costcenter cc
JOIN cafemanager.wn_complex c
    ON cc.complex_name = c.team_name
SET
    cc.sector_name   = c.sector_name,
    cc.division_name = c.division_name,
    cc.region_name   = c.region_name,
    cc.district_name = c.district_name
WHERE
      cc.sector_name <> c.sector_name
   OR cc.division_name <> c.division_name
   OR cc.region_name <> c.region_name
   OR cc.district_name <> c.district_name
`;

const FIELDS = ["sector", "division", "region", "district"];

const csv = (r) =>
  !r?.length
    ? ""
    : [Object.keys(r[0]).join(","), ...r.map((x) => Object.values(x).join(","))].join("\n");

/**
 * Turns the wide mismatch rows (complex_sector/costcenter_sector side by side) into a
 * long-format diff: one row per field that will actually change, with old/new values —
 * this is the file to eyeball before confirming, since it says exactly what will change.
 */
function buildDiff(mismatches) {
  const diff = [];
  for (const row of mismatches) {
    for (const field of FIELDS) {
      const oldValue = row[`costcenter_${field}`];
      const newValue = row[`complex_${field}`];
      if (oldValue !== newValue) {
        diff.push({
          costcenter_id: row.costcenter_id,
          complex_name: row.complex_name,
          field,
          current_value: oldValue,
          will_become: newValue,
        });
      }
    }
  }
  return diff;
}

// Default run = dry run: writes a before-diff CSV (what will change) + takes no action.
// Run with CONFIRM_FIX=true to back up, apply the update, and also write an after-state CSV
// for the same rows so you can compare before vs after directly.
//   CONFIRM_FIX=true npx playwright test --grep "Fix complex vs costcenter"
test("Fix complex vs costcenter hierarchy mismatches", async ({}, testInfo) => {

  const db = testInfo.project.metadata?.dbstagWrite; // uses WRITE creds — add this block to playwright.config.js metadata first
  const confirm = process.env.CONFIRM_FIX === "true";
  const runId = Date.now();

  const mismatches = await queryDatabase(MISMATCH_QUERY, db);

  if (mismatches.length === 0) {
    console.log("No mismatches found. Nothing to fix.");
    return;
  }

  const diff = buildDiff(mismatches);
  const beforeFile = path.join(process.cwd(), "test-results", `hierarchy_diff_before_${runId}.csv`);

  fs.mkdirSync(path.dirname(beforeFile), { recursive: true });
  fs.writeFileSync(beforeFile, csv(diff));

  console.log(`
    Costcenters affected: ${mismatches.length}
    Field-level changes: ${diff.length}
    Complexes: ${[...new Set(mismatches.map((x) => x.complex_name))].join(",")}
    Before/diff preview saved to: ${beforeFile}
  `);

  if (!confirm) {
    console.log(`
    Dry run only — no changes made.
    Open ${beforeFile} and check every "current_value" -> "will_become" pair, then
    re-run with CONFIRM_FIX=true to back up and apply the fix.
    `);
    return;
  }

  const costcenterIds = mismatches.map((r) => r.costcenter_id);
  const idList = costcenterIds.join(",");

  // ---------------- BACKUP ----------------
  const backupTable = `wn_costcenter_backup_${runId}`;
  await queryDatabase(
    `CREATE TABLE cafemanager.${backupTable} AS
     SELECT * FROM cafemanager.wn_costcenter WHERE id IN (${idList})`,
    db
  );
  console.log(`Backup complete: cafemanager.${backupTable} (${costcenterIds.length} row(s))`);

  // ---------------- UPDATE ----------------
  // Note: queryDatabase opens/closes its own connection per call and each statement auto-commits —
  // there's no transaction wrapping backup+update+verify, so a failed verify below means restoring
  // manually from the backup table, not an automatic rollback.
  // Command - CONFIRM_FIX=true npx playwright test --grep "Fix complex vs costcenter" --project=chromium
  await queryDatabase(UPDATE_QUERY, db);

  // ---------------- VERIFY + AFTER-STATE FILE ----------------
  const remaining = await queryDatabase(MISMATCH_QUERY, db);

  const after = await queryDatabase(
    `SELECT
        cc.id AS costcenter_id,
        c.team_name AS complex_name,
        cc.sector_name AS costcenter_sector,
        cc.division_name AS costcenter_division,
        cc.region_name AS costcenter_region,
        cc.district_name AS costcenter_district
     FROM cafemanager.wn_costcenter cc
     JOIN cafemanager.wn_complex c ON cc.complex_name = c.team_name
     WHERE cc.id IN (${idList})`,
    db
  );

  const afterFile = path.join(process.cwd(), "test-results", `hierarchy_after_${runId}.csv`);
  fs.writeFileSync(afterFile, csv(after));
  console.log(`After-state saved to: ${afterFile} — compare against ${beforeFile}`);

  if (remaining.length > 0) {
    console.log(`
    ${remaining.length} mismatch(es) still remain after update.
    Restore from cafemanager.${backupTable} if needed, and investigate before re-running.
    `);
    return;
  }

  console.log(`
    Update applied. All hierarchy mismatches resolved.
    Backup saved as cafemanager.${backupTable} if you need to revert.
  `);
});