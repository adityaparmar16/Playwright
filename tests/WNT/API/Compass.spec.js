import { test, expect } from "@playwright/test";
import fs from "fs";
import dotenv from "dotenv";
import { fetchAuth } from "../../../utils/apiHelper.js";

dotenv.config();

const d = (n) =>
  new Date(Date.now() - n * 864e5)
    .toISOString()
    .split("T")[0];

const end = d(1);

const BASE_URL = process.env.COMPASS_DEV_API_URL;

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

/**
 * Wraps fetchAuth with retries: retries on a non-200 status or a thrown error
 * (network hiccup, transient 5xx/429, etc.) instead of failing on the first flake.
 */
async function fetchWithRetry(url, { attempts = 3, delayMs = 5000 } = {}) {
  let lastResponse;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchAuth(url);
      if (response.status === 200) return response;

      lastResponse = response;
      console.log(
        `⚠️ Attempt ${attempt}/${attempts} returned status ${response.status}` +
          (attempt < attempts ? ` — retrying in ${delayMs}ms` : "")
      );
    } catch (err) {
      lastError = err;
      console.log(
        `⚠️ Attempt ${attempt}/${attempts} threw: ${err.message}` +
          (attempt < attempts ? ` — retrying in ${delayMs}ms` : "")
      );
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastResponse) return lastResponse; // let the existing status-200 assertion report the final failure
  throw lastError;
}

const sample = (arr, n = 5) =>
  [...arr]
    .sort(() => 0.5 - Math.random())
    .slice(0, n);

// `heavy: true` marks unfiltered/broad queries (no complex/district/region/division scoping)
// that pull much larger datasets and need more time.
// `limit` overrides the default page size — compass is capped lower since it's the broadest
// query and was timing out at limit=1000.
// `startDaysAgo` overrides the default 366-day (1yr) lookback — compass uses ~3 months.
const testCases = [
  ["compass", "compass", true, 1000, 91],
  ["complex", "complex=C-27833,C-57269,C-45159", false, 1000, 366],
  ["district", "district=CKH16,CKA22", false, 1000, 366],
  ["region", "region=CKH000,CKA000", false, 1000, 366],
  ["division", "division=CK0000,CH0000", false, 1000, 366],
  ["sector", "sector=F00000,C00000", true, 1000, 366],
];

testCases.forEach(([name, query, heavy, limit, startDaysAgo]) => {

  const caseStart = d(startDaysAgo);

  const url =
    `${BASE_URL}?${query}&start=${caseStart}&end=${end}&limit=${limit}`;

  const file = `tests/downloads/${name}.json`;

  test(`API ${name}`, async () => {

    if (heavy) {
      test.setTimeout(240000); // broad queries pull more records — give them more room than the default 90s
    }

    console.log("\n==================================================");
    console.log(`🚀 TEST STARTED : ${name}`);
    console.log("==================================================");

    console.log(`🌐 API HIT: ${url}`);

    // ---------------- INITIAL API CALL ----------------
    const response = await fetchWithRetry(url);

    console.log(`📡 RESPONSE STATUS: ${response.status}`);

    if (response.status !== 200) {
      console.log("❌ API FAILED");
      console.log("Response Body:");
      console.log(response.body);
    }

    expect(response.status).toBe(200);

    const json = JSON.parse(response.body);

    console.log(
      `📦 TOTAL RECORDS RECEIVED: ${json.wastes?.length || 0}`
    );

    const sampledData = sample(json.wastes || []);

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

    const liveResponse = await fetchWithRetry(url);

    console.log(`📡 LIVE API STATUS: ${liveResponse.status}`);

    if (liveResponse.status !== 200) {
      console.log("❌ LIVE API FAILED");
      console.log("Live Response Body:");
      console.log(liveResponse.body);
    }

    expect(liveResponse.status).toBe(200);

    const liveJson = JSON.parse(liveResponse.body);

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