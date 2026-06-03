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
const start = d(366);

const BASE_URL = process.env.BAMCO_PROD_API_URL;

const fields = [
  "id",
  "division_name",
  "tablet_id",
  "profile_id",
  "profile_name",
  "kitchen_id",
  "kitchen_name",
  "region_id",
  "region_name",
  "district_id",
  "district_name",
  "account_id",
  "account_name",
  "campus_id",
  "campus_name",
  "costcenter",
  "costcenter_name",
  "created_at",
  "kind_of_waste",
  "lbs_waste",
  "waste_destination",
  "sector_id",
  "sector_name",
];

const sample = (arr, n = 5) =>
  [...arr].sort(() => 0.5 - Math.random()).slice(0, n);

const common = {
  start,
  end,
  limit: "1000",
  bamco: "1",
};

[
  ["non_entry_id", { sector: "A0000" }],
  ["app_date", { sector: "A0000", app_date: "1" }],
  ["pagination", { campus: "141", page: "2" }],
  ["campus", { campus: "141" }],
  ["district", { district: "70" }],
  ["region", { region: "11" }],
  ["account", { account: "531" }],
].forEach(([name, params]) => {

  const url = `${BASE_URL}?${new URLSearchParams({
    ...common,
    ...params,
  })}`;

  const file = `tests/downloads/${name}.json`;

  test(`API ${name}`, async () => {

    console.log("\n==================================================");
    console.log(`🚀 TEST STARTED : ${name}`);
    console.log("==================================================");

    console.log(`🌐 API HIT: ${url}`);

    // ---------------- FIRST API CALL ----------------
    const r = await fetchAuth(url);

    console.log(`📡 RESPONSE STATUS: ${r.status}`);

    if (r.status !== 200) {
      console.log("❌ API FAILED");
      console.log("Response Body:");
      console.log(r.body);
    }

    expect(r.status).toBe(200);

    const j = JSON.parse(r.body);

    console.log(`📦 TOTAL RECORDS RECEIVED: ${j.wastes?.length || 0}`);

    const s = sample(j.wastes || []);

    console.log(
      `🎯 RANDOM SAMPLE IDS SELECTED FOR VALIDATION:`,
      s.map(v => v.id)
    );

    // ---------------- FIELD VALIDATION ----------------
    s.forEach((w, index) => {

      console.log(
        `\n🔍 VALIDATING SAMPLE ${index + 1} | ID: ${w.id}`
      );

      fields.forEach((f) => {
        console.log(`   ✅ Checking field: ${f}`);

        expect(w).toHaveProperty(f);
      });

    });

    // ---------------- SAVE RESPONSE ----------------
    fs.mkdirSync("tests/downloads", { recursive: true });

    fs.writeFileSync(file, JSON.stringify(j, null, 2));

    console.log(`💾 RESPONSE SAVED TO: ${file}`);

    // ---------------- SECOND API CALL ----------------
    console.log("\n🔄 HITTING LIVE API AGAIN FOR DATA COMPARISON");

    const liveResponse = await fetchAuth(url);

    console.log(`📡 LIVE API STATUS: ${liveResponse.status}`);

    const live = JSON.parse(liveResponse.body);

    // ---------------- DATA COMPARISON ----------------
    sample(j.wastes || []).forEach((w) => {

      console.log(`\n🧪 COMPARING RECORD ID: ${w.id}`);

      const x = live.wastes.find((v) => v.id === w.id);

      if (!x) {
        console.log(`❌ ID NOT FOUND IN LIVE RESPONSE: ${w.id}`);
      }

      expect(x).toBeTruthy();

      fields.forEach((f) => {

        console.log(
          `   🔁 Comparing field "${f}" | OLD: ${w[f]} | LIVE: ${x[f]}`
        );

        expect(x[f]).toEqual(w[f]);
      });
    });

    console.log("\n✅ TEST COMPLETED SUCCESSFULLY");
    console.log("==================================================\n");

  });
});