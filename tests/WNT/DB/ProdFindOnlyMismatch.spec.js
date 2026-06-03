import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const q = `
SELECT tp.id,tp.kitchen_id,tp.campus_id,k.complex_id,tp.created_at
FROM cafemanager.ot_tablet_profile tp
JOIN cafemanager.ot_kitchen k ON tp.kitchen_id=k.id
WHERE tp.campus_id LIKE 'C-%'
AND k.complex_id LIKE 'C-%'
AND NOT(tp.campus_id<=>k.complex_id)
ORDER BY tp.kitchen_id,tp.created_at DESC
`;

const csv = r => !r?.length ? "" :
  [Object.keys(r[0]).join(","),
   ...r.map(x => Object.values(x).join(","))].join("\n");

test("Find C-* mismatches", async ({}, testInfo) => {

  const db = testInfo.project.metadata?.dbproduction,
        rows = await queryDatabase(q, db),
        file = path.join(process.cwd(),"test-results",`mismatches_${Date.now()}.csv`);

  fs.mkdirSync(path.dirname(file), { recursive:true });
  fs.writeFileSync(file, csv(rows));

  console.log(`
    Mismatches: ${rows.length}
    Kitchens: ${[...new Set(rows.map(x => x.kitchen_id))].join(",") || "None"}
  `);
});