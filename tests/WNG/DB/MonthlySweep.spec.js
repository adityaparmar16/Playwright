import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const save = (n, d) => {
        const p = path.join(process.cwd(), "test-results", n);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, d);
        return p;
      },
      csv = r => !r?.length ? "" :
        [Object.keys(r[0]).join(","),
         ...r.map(x => Object.values(x).map(v =>
           `"${String(v ?? "").replace(/"/g,'""')}"`
         ).join(","))].join("\n");

// Default run = find duplicates + save a preview CSV only, no deletion.
// Run with CONFIRM_DELETE=true to actually delete the duplicate rows (all but the first per group).
//   CONFIRM_DELETE=true npx playwright test --grep "Find & delete wastenot global duplicates"
//
// SCAN_DAYS controls how far back the duplicate check looks — narrower = faster.
// Widen it (or set to null to scan everything) if you need to catch older duplicates.
const SCAN_DAYS = 90;

test("Find & delete wastenot global duplicates", async ({}, testInfo) => {

  test.setTimeout(240000); // full-table group-by can be slow — give it more room than the default 90s

  const db = { ...testInfo.config.metadata?.globalprodWrite, database: "wastenotglobal" };
  if (!db.host) throw Error("DB config missing");

  const confirm = process.env.CONFIRM_DELETE === "true";

  const dateFilter = SCAN_DAYS
    ? `WHERE created_date >= DATE_SUB(NOW(), INTERVAL ${SCAN_DAYS} DAY)`
    : "";

  // No JOINs here — entity_units/entities aren't part of what defines a duplicate,
  // so dragging them into the group-by scan just adds cost for no benefit.
  // command = CONFIRM_DELETE=true npx playwright test --grep "Find & delete wastenot global duplicates" --project=chromium
  const q = `
    SELECT
      GROUP_CONCAT(id) ids,
      tablet_id, kitchen_profile_id, kitchen_profile_container_id,
      kitchen_id, entity_unit_id, entity_id, organization_id,
      kind_of_waste, waste_destination, type_of_waste,
      calculated_amount, calculated_unit, amount, unit,
      container_fill_level, num_containers, exact_weight_reported,
      created_date, COUNT(id) AS total
    FROM waste_records
    ${dateFilter}
    GROUP BY
      tablet_id, kitchen_profile_id, kitchen_profile_container_id,
      kitchen_id, entity_unit_id, entity_id, organization_id,
      kind_of_waste, waste_destination, type_of_waste,
      calculated_amount, calculated_unit, amount, unit,
      container_fill_level, num_containers, exact_weight_reported,
      created_date
    HAVING total > 1
  `;

  const groups = await queryDatabase(q, db);

  // Enrich with entity_unit_name/entity_name only for the (small) set of affected entities —
  // not for the whole table.
  const entityUnitIds = [...new Set(groups.map((r) => r.entity_unit_id))];
  const entityIds = [...new Set(groups.map((r) => r.entity_id))];

  let unitNames = {}, entityNames = {};
  if (entityUnitIds.length) {
    const rows = await queryDatabase(
      `SELECT id, name FROM entity_units WHERE id IN (${entityUnitIds.join(",")})`,
      db
    );
    unitNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }
  if (entityIds.length) {
    const rows = await queryDatabase(
      `SELECT id, name FROM entities WHERE id IN (${entityIds.join(",")})`,
      db
    );
    entityNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }

  const enriched = groups.map((r) => ({
    ...r,
    entity_unit_name: unitNames[r.entity_unit_id] ?? "",
    entity_name: entityNames[r.entity_id] ?? "",
  }));

  save(`wastenot_duplicate_groups.csv`, csv(enriched));

  // Keep the first id in each group, mark the rest for deletion.
  const idsToDelete = [...new Set(
    groups.flatMap(r => r.ids.split(",").slice(1))
  )];

  console.log(`
    Duplicate groups found: ${groups.length}
    Rows to delete (all but first per group): ${idsToDelete.length}
  `);

  if (!idsToDelete.length) {
    console.log("No duplicates found.");
    return;
  }

  if (!confirm) {
    console.log(`
    Dry run only — no rows deleted.
    Review test-results/wastenot_duplicate_groups.csv, then re-run with
    CONFIRM_DELETE=true to permanently delete the ${idsToDelete.length} duplicate row(s).
    `);
    return;
  }

  const idList = idsToDelete.join(",");

  // Save the full rows being deleted BEFORE deleting — this is the only record of them afterward.
  const toDelete = await queryDatabase(`
    SELECT * FROM waste_records WHERE id IN (${idList})
  `, db);
  const backupFile = save(`wastenot_deleted_rows_${Date.now()}.csv`, csv(toDelete));
  console.log(`Full duplicate rows saved to ${backupFile} before deleting.`);

  await queryDatabase(`
    DELETE FROM waste_records WHERE id IN (${idList})
  `, db);

  console.log(`Deleted ${idsToDelete.length} duplicate waste_records row(s).`);
});