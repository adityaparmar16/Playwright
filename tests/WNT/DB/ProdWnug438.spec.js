import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const map = {
  1730:"C-40575",7542:"C-61177"
};

const csv = r => !r?.length ? "" :
  [Object.keys(r[0]).join(","),
   ...r.map(x => Object.values(x).join(","))].join("\n");

Object.entries(map).forEach(([kitchen, campus]) => {

  test(`Kitchen ${kitchen}`, async ({}, testInfo) => {

    const db = testInfo.project.metadata?.dbproduction,
          rows = await queryDatabase(
            `SELECT * FROM cafemanager.ot_tablet_profile
             WHERE kitchen_id='${kitchen}'
             ORDER BY created_at DESC`, db);

    if (!rows.length) return console.log(`No data for ${kitchen}`);

    const bad = rows.filter(r => r.campus_id !== campus);

    if (bad.length)
      throw Error(`Mismatch: ${bad.map(x => x.campus_id).join(",")}`);

    const file = path.join(
      process.cwd(),
      "test-results",
      `kitchen_${kitchen}.csv`
    );

    fs.mkdirSync(path.dirname(file), { recursive:true });
    fs.writeFileSync(file, csv(rows));

    console.log(`Validated ${kitchen}`);
  });
});