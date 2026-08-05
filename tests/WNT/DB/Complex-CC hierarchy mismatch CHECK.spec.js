import { test } from "@playwright/test";
import { queryDatabase } from "../../../utils/db.js";
import fs from "fs";
import path from "path";

const q = `
SELECT DISTINCT
    c.team_name AS complex_name,
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
      c.sector_name <> cc.sector_name
   OR c.division_name <> cc.division_name
   OR c.region_name <> cc.region_name
   OR c.district_name <> cc.district_name
`;

const csv = r => !r?.length ? "" :
  [Object.keys(r[0]).join(","),
   ...r.map(x => Object.values(x).join(","))].join("\n");

test("Find complex vs costcenter hierarchy mismatches", async ({}, testInfo) => {

  const db = testInfo.project.metadata?.dbstag,
        rows = await queryDatabase(q, db),
        file = path.join(process.cwd(), "test-results", `hierarchy_mismatches_check_${Date.now()}.csv`);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, csv(rows));

  const mismatchTypes = rows.reduce((acc, r) => {
    if (r.complex_sector !== r.costcenter_sector) acc.sector++;
    if (r.complex_division !== r.costcenter_division) acc.division++;
    if (r.complex_region !== r.costcenter_region) acc.region++;
    if (r.complex_district !== r.costcenter_district) acc.district++;
    return acc;
  }, { sector: 0, division: 0, region: 0, district: 0 });

  console.log(`
    Mismatches: ${rows.length}
    Complexes: ${[...new Set(rows.map(x => x.complex_name))].join(",") || "None"}
    By field — sector: ${mismatchTypes.sector}, division: ${mismatchTypes.division}, region: ${mismatchTypes.region}, district: ${mismatchTypes.district}
  `);
});