import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import { csv, save } from "../../../utils/dbReport.js";

const map = {
  1730:"C-40575",7542:"C-61177"
};


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

    save(`kitchen_${kitchen}.csv`, csv(rows));

    console.log(`Validated ${kitchen}`);
  });
});