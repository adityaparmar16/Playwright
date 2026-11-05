import { test, expect } from "@playwright/test";
import fs from "fs";
import dotenv from "dotenv";
import { fetchWithRetry, parseWastes, requireEnv, validateWasteRecord } from "../../../utils/apiHelper.js";

dotenv.config();

const d = (n) =>
  new Date(Date.now() - n * 864e5)
    .toISOString()
    .split("T")[0];

const end = d(1);

const BASE_URL = requireEnv("COMPASS_PROD_API_URL");

// Any record with this division_name reports school_id instead of costcenter.
const SCHOOLS_DIVISION_NAME = "Schools Division";

// Fields common to every record, in order, with a placeholder where costcenter/school_id goes.
const FIELDS_BEFORE_ID_FIELD = [
  "id",
  "tablet_id",
  "profile_id",
  "profile_name",
  "kitchen_id",
  "kitchen_name",
  "sector_id",
  "sector_name",
  "division_id",
  "division_name",
  "region_id",
  "region_name",
  "district_id",
  "district_name",
  "complex_id",
];
const FIELDS_AFTER_ID_FIELD = ["created_at", "kind_of_waste", "lbs_waste", "waste_destination"];

/**
 * Returns the field list to validate for a given record: `school_id` if the record
 * belongs to the Schools division (and its associated region/district/complex), else `costcenter`.
 */
function getFieldsForRecord(record) {
  const idField = record.division_name === SCHOOLS_DIVISION_NAME ? "school_id" : "costcenter";
  return [...FIELDS_BEFORE_ID_FIELD, idField, ...FIELDS_AFTER_ID_FIELD];
}

const sample = (arr, n = 20) =>
  [...arr]
    .sort(() => 0.5 - Math.random())
    .slice(0, n);

// `heavy: true` marks unfiltered/broad queries (no complex/district/region/division scoping)
// that pull much larger datasets and need more time.
// `limit` overrides the default page size — compass is capped lower since it's the broadest
// query and was timing out at limit=1000.
// `startDaysAgo` overrides the default 366-day (1yr) lookback — compass uses ~3 months.
const testCases = [
  ["compass", "compass", true, 1000, 191],
  ["complex", "complex=C-27833,C-57269,C-10107", false, 1000, 366],
  // CKH16/CKA22 returned 0 records; CKH10/CKA40 have data in the same regions
  ["district", "district=CKH10,CKA40", false, 1000, 366],
  ["region", "region=CKH000,CKA000", false, 1000, 366],
  ["division", "division=CK0000,CH0000", false, 1000, 366],
  ["sector", "sector=F00000,C00000", true, 1000, 366],
];

testCases.forEach(([name, query, heavy, limit, startDaysAgo]) => {

  const caseStart = d(startDaysAgo);

  const url =
    `${BASE_URL}?${query}&start=${caseStart}&end=${end}&limit=${limit}`;

  const file = `tests/downloads/compass-${name}.json`;

  test(`API ${name}`, async () => {

    if (heavy) {
      test.setTimeout(240000); // broad queries pull more records — give them more room than the default 90s
    }

    console.log("\n==================================================");
    console.log(`🚀 TEST STARTED : ${name}`);
    console.log("==================================================");

    console.log(`🌐 API HIT: ${url}`);

    // Heavy queries can legitimately take longer than the default 90s per request
    const fetchOpts = heavy ? { timeoutMs: 200000, attempts: 2 } : {};

    // ---------------- INITIAL API CALL ----------------
    const response = await fetchWithRetry(url, fetchOpts);

    console.log(`📡 RESPONSE STATUS: ${response.status}`);

    const json = parseWastes(response, `Compass ${name}`);

    console.log(
      `📦 TOTAL RECORDS RECEIVED: ${json.wastes.length}`
    );

    expect(json.wastes.length, `Compass ${name} returned no records`).toBeGreaterThan(0);

    const sampledData = sample(json.wastes);

    console.log(
      `🎯 RANDOM SAMPLE IDS SELECTED FOR VALIDATION:`,
      sampledData.map((item) => item.id)
    );

    // ---------------- FIELD VALIDATION ----------------
    sampledData.forEach((waste, index) => {

      console.log(
        `\n🔍 VALIDATING SAMPLE ${index + 1} | ID: ${waste.id}`
      );

      const isSchools = waste.division_name === SCHOOLS_DIVISION_NAME;
      if (isSchools) {
        console.log(`   🏫 Schools division record detected — expecting "school_id" instead of "costcenter"`);
      }

      getFieldsForRecord(waste).forEach((field) => {

        console.log(`   ✅ Checking field: ${field}`);

        expect(waste).toHaveProperty(field);
      });

      // Type / value checks (number, valid date in range, non-empty ids)
      expect(
        validateWasteRecord(waste, { start: caseStart, end }),
        `Bad values in record ${waste.id}`
      ).toEqual([]);
    });

    // ---------------- SAVE RESPONSE ----------------
    fs.mkdirSync("tests/downloads", {
      recursive: true,
    });

    fs.writeFileSync(
      file,
      JSON.stringify(json, null, 2)
    );

    console.log(`💾 RESPONSE SAVED TO: ${file}`);

    // ---------------- SECOND API CALL ----------------
    console.log("\n🔄 HITTING LIVE API AGAIN FOR DATA COMPARISON");

    const liveResponse = await fetchWithRetry(url, fetchOpts);

    console.log(`📡 LIVE API STATUS: ${liveResponse.status}`);

    const liveJson = parseWastes(liveResponse, `Compass ${name} (live)`);

    // ---------------- DATA COMPARISON ----------------
    sampledData.forEach((waste) => {

      console.log(`\n🧪 COMPARING RECORD ID: ${waste.id}`);

      const liveWaste = liveJson.wastes.find(
        (item) => item.id === waste.id
      );

      if (!liveWaste) {
        console.log(
          `❌ RECORD NOT FOUND IN LIVE RESPONSE FOR ID: ${waste.id}`
        );
      }

      expect(liveWaste).toBeTruthy();

      getFieldsForRecord(waste).forEach((field) => {

        console.log(
          `   🔁 Comparing field "${field}" | OLD: ${waste[field]} | LIVE: ${liveWaste[field]}`
        );

        expect(liveWaste[field]).toEqual(waste[field]);
      });
    });

    console.log(`\n✅ API PASSED : ${name}`);
    console.log("==================================================\n");
  });
});