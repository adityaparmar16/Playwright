import { test, expect } from "@playwright/test";
import fs from "fs";
import dotenv from "dotenv";
import { fetchAuth } from "../../../utils/apiHelper.js";

dotenv.config();

const d = (n) =>
  new Date(Date.now() - n * 864e5)
    .toISOString()
    .split("T")[0];

const start = d(366);
const end = d(1);

const BASE_URL = process.env.COMPASS_PROD_API_URL;

const fields = [
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
  "costcenter",
  "created_at",
  "kind_of_waste",
  "lbs_waste",
  "waste_destination",
];

const sample = (arr, n = 5) =>
  [...arr]
    .sort(() => 0.5 - Math.random())
    .slice(0, n);

const testCases = [
  ["compass", "compass"],
  ["complex", "complex=C-27833"],
  ["district", "district=CKH16"],
  ["region", "region=CKH000"],
  ["division", "division=CK0000"],
  ["sector", "sector=F00000,C00000"],
];

testCases.forEach(([name, query]) => {

  const url =
    `${BASE_URL}?${query}&start=${start}&end=${end}&limit=1000`;

  const file = `tests/downloads/${name}.json`;

  test(`API ${name}`, async () => {

    console.log("\n==================================================");
    console.log(`🚀 TEST STARTED : ${name}`);
    console.log("==================================================");

    console.log(`🌐 API HIT: ${url}`);

    // ---------------- INITIAL API CALL ----------------
    const response = await fetchAuth(url);

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

      fields.forEach((field) => {

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

    const liveResponse = await fetchAuth(url);

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

      fields.forEach((field) => {

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