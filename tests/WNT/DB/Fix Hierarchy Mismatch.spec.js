import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const MISMATCH_QUERY = `
SELECT
    c.team_name AS complex_name,
    cc.team_name AS costcenter_name,
    cc.id AS costcenter_id,

    c.sector_name   AS complex_sector,
    cc.sector_name  AS costcenter_sector,

    c.division_name AS complex_division,
    cc.division_name AS costcenter_division,

    c.region_name   AS complex_region,
    cc.region_name  AS costcenter_region,

    c.district_name AS complex_district,
    cc.district_name AS costcenter_district

FROM cafemanager.wn_complex c
JOIN cafemanager.wn_costcenter cc
    ON c.team_name = cc.complex_name

WHERE
       NOT (c.sector_name   <=> cc.sector_name)
    OR NOT (c.division_name <=> cc.division_name)
    OR NOT (c.region_name   <=> cc.region_name)
    OR NOT (c.district_name <=> cc.district_name)

ORDER BY
    c.team_name,
    cc.team_name;
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
       NOT (cc.sector_name   <=> c.sector_name)
    OR NOT (cc.division_name <=> c.division_name)
    OR NOT (cc.region_name   <=> c.region_name)
    OR NOT (cc.district_name <=> c.district_name);
`;

const FIELDS = ["sector", "division", "region", "district"];

const csv = (rows) =>
  !rows?.length
    ? ""
    : [
        Object.keys(rows[0]).join(","),
        ...rows.map((row) =>
          Object.values(row)
            .map((value) =>
              `"${String(value ?? "").replace(/"/g, '""')}"`
            )
            .join(",")
        ),
      ].join("\n");

function buildDiff(mismatches) {
  const diff = [];

  for (const row of mismatches) {
    for (const field of FIELDS) {
      const oldValue = row[`costcenter_${field}`];
      const newValue = row[`complex_${field}`];

      // NULL-safe comparison
      if (oldValue !== newValue) {
        diff.push({
          costcenter_id: row.costcenter_id,
          complex_name: row.complex_name,
          costcenter_name: row.costcenter_name,
          field,
          current_value: oldValue ?? null,
          will_become: newValue ?? null,
        });
      }
    }
  }

  return diff;
}

test("Fix complex vs costcenter hierarchy mismatches", async ({}, testInfo) => {
  const db = testInfo.project.metadata?.dbproduction;
  const confirm = process.env.CONFIRM_FIX === "true";
  const runId = Date.now();

  // ---------------- FIND MISMATCHES ----------------

  const mismatches = await queryDatabase(MISMATCH_QUERY, db);

  if (mismatches.length === 0) {
    console.log("No mismatches found. Nothing to fix.");
    return;
  }

  const diff = buildDiff(mismatches);

  const beforeFile = path.join(
    process.cwd(),
    "test-results",
    `hierarchy_diff_before_${runId}.csv`
  );

  fs.mkdirSync(path.dirname(beforeFile), { recursive: true });
  fs.writeFileSync(beforeFile, csv(diff));

  console.log(`
    Mismatches found: ${mismatches.length}
    Field-level changes: ${diff.length}
    Complexes: ${
      [...new Set(mismatches.map((x) => x.complex_name))].join(", ") || "None"
    }

    Before/diff preview saved to:
    ${beforeFile}
  `);

  // ---------------- DRY RUN ----------------

  if (!confirm) {
    console.log(`
    Dry run only — no changes made.

    Review the CSV:
    ${beforeFile}

    Once verified, re-run with:

    CONFIRM_FIX=true npx playwright test --grep "Fix complex vs costcenter" --project=chromium
    `);

    return;
  }

  const costcenterIds = mismatches.map((row) => row.costcenter_id);
  const idList = costcenterIds.join(",");

  // ---------------- BACKUP ----------------

  const backupTable = `wn_costcenter_backup_${runId}`;

  await queryDatabase(
    `CREATE TABLE cafemanager.${backupTable} AS
     SELECT *
     FROM cafemanager.wn_costcenter
     WHERE id IN (${idList})`,
    db
  );

  console.log(
    `Backup complete: cafemanager.${backupTable} (${costcenterIds.length} row(s))`
  );

  // ---------------- UPDATE ----------------

  await queryDatabase(UPDATE_QUERY, db);

  console.log("Hierarchy update completed.");

  // ---------------- VERIFY ----------------

  const remaining = await queryDatabase(MISMATCH_QUERY, db);

  const after = await queryDatabase(
    `SELECT
        c.team_name AS complex_name,
        cc.team_name AS costcenter_name,
        cc.id AS costcenter_id,

        c.sector_name AS complex_sector,
        cc.sector_name AS costcenter_sector,

        c.division_name AS complex_division,
        cc.division_name AS costcenter_division,

        c.region_name AS complex_region,
        cc.region_name AS costcenter_region,

        c.district_name AS complex_district,
        cc.district_name AS costcenter_district

     FROM cafemanager.wn_complex c
     JOIN cafemanager.wn_costcenter cc
       ON c.team_name = cc.complex_name

     WHERE cc.id IN (${idList})

     ORDER BY
        c.team_name,
        cc.team_name`,
    db
  );

  const afterFile = path.join(
    process.cwd(),
    "test-results",
    `hierarchy_after_${runId}.csv`
  );

  fs.writeFileSync(afterFile, csv(after));

  console.log(`
    After-state saved to:
    ${afterFile}

    Compare against:
    ${beforeFile}
  `);

  // ---------------- FINAL RESULT ----------------

  if (remaining.length > 0) {
    console.log(`
    ❌ ${remaining.length} mismatch(es) still remain after update.

    Backup available at:
    cafemanager.${backupTable}

    Investigate before re-running.
    `);

    return;
  }

  console.log(`
    ✅ Update applied successfully.
    ✅ All hierarchy mismatches resolved.

    Backup:
    cafemanager.${backupTable}
  `);
});