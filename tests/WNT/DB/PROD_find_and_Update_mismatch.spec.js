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

const save = (n,d) => {
  const p = path.join(process.cwd(),"test-results",n);
  fs.mkdirSync(path.dirname(p),{ recursive:true });
  fs.writeFileSync(p,d);
};

test("Fix C-* mismatches", async ({}, testInfo) => {

  const read = testInfo.project.metadata?.dbproduction,
        write = testInfo.project.metadata?.dbproductionWrite || read,
        t = Date.now();

  const before = await queryDatabase(q, read);

  save(`before_${t}.csv`, csv(before));

  if (!before.length) return console.log("No mismatches");

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

  save(`after_${t}.csv`, csv(after));

  console.log(`
    Before: ${before.length}
    After: ${after.length}
    Fixed: ${before.length - after.length}
  `);
});