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
           `"${String(v ?? "").replace(/"/g, '""')}"`
         ).join(","))].join("\n");


test("Find incomplete OnTrack setup", async ({}, testInfo) => {

  test.setTimeout(240000);

  const db = testInfo.project.metadata?.dbproduction;

  if (!db) throw Error("DB config missing");

  const rows = await queryDatabase(`
    SELECT *
    FROM cafemanager.ontrack
    WHERE nr_of_kitchens IS NOT NULL
      AND nr_of_kitchens > 0
      AND (completed IS NULL OR completed <> 1)
    ORDER BY updated_at DESC
  `, db);

  if (!rows.length) {

    console.log(
      "\n✅ OnTrack setup check passed."
    );

    console.log(
      "No records found with nr_of_kitchens populated and completed != 1."
    );

    return;
  }

  const complexes = [
    ...new Set(
      rows
        .map(row => row.complex_id)
        .filter(Boolean)
    )
  ];

  console.log(`
    ❌ OnTrack setup issue found.

    Records found: ${rows.length}
    Unique complexes: ${complexes.length}
  `);

  console.log("\nAffected complexes:");

  complexes.forEach(complexId => {
    console.log(`- ${complexId}`);
  });

  const file = save(
    "ontrack_incomplete_setup.csv",
    csv(rows)
  );

  save(
    "ontrack_incomplete_setup_complexes.csv",
    csv(
      complexes.map(complexId => ({
        complex_id: complexId
      }))
    )
  );

  console.log(`
    Full records saved to:
    ${file}

    Complex list saved to:
    test-results/ontrack_incomplete_setup_complexes.csv
  `);

  throw new Error(
    `OnTrack setup check failed: ${rows.length} record(s) found across ${complexes.length} complex(es).`
  );
});