import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import { csv, save, toSqlDateTime as f } from "../../../utils/dbReport.js";


test("Find & update duplicates", async ({}, testInfo) => {

  const db = testInfo.project.metadata?.dbproductionWrite;
  if (!db) throw Error("DB config missing");

  const start = "2026-01-01 00:00:00",
        end = `${f(new Date()).split(" ")[0]} 23:59:59`,
        appDate = f(new Date(Date.now() + 48 * 60 * 60 * 1000));

  const q = `
    SELECT GROUP_CONCAT(id) ids
    FROM cafemanager.ot_tablet_profile
    WHERE created_at BETWEEN '${start}' AND '${end}'
    GROUP BY tablet_id,profile_id,campus_id,kitchen_id,created_at,
             kind_of_waste,lbs_waste,waste_destination,container_type
    HAVING COUNT(*) > 1
  `;

  const rows = await queryDatabase(q, db);

  save(`duplicates.csv`, csv(rows));

  const ids = [...new Set(
    rows.flatMap(r => r.ids.split(",").slice(1))
  )];

  if (!ids.length) return console.log("No duplicates found");

  const idList = ids.join(",");

  await queryDatabase(`
    UPDATE cafemanager.ot_tablet_profile
    SET lbs_waste='0.00 lbs',
        container_fill_level=0,
        app_date='${appDate}'
    WHERE id IN (${idList})
  `, db);

  const updated = await queryDatabase(`
    SELECT * FROM cafemanager.ot_tablet_profile
    WHERE id IN (${idList})
  `, db);

  console.log(`Updated ${ids.length} duplicate ids`);

  save(`updated_duplicates.csv`, csv(updated));
});