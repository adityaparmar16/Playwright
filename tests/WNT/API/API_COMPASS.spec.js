import { test, expect } from "@playwright/test";
import fs from "fs";
import { fetchAuth } from "../../../utils/apiHelper.js";

const BASE_URL = "https://cafemanager-api.cafebonappetit.com/api/wastenot";

// Utility to format dates
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Dynamic date range (till yesterday)
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

function getDateRange(daysBack = 365) {
  const end = formatDate(yesterday);
  const startDate = new Date(yesterday);
  startDate.setDate(startDate.getDate() - daysBack);
  const start = formatDate(startDate);
  return { start, end };
}

// Required fields for Compass API
const requiredFields = [
  "id", "tablet_id", "profile_id", "profile_name",
  "kitchen_id", "kitchen_name", "sector_id", "sector_name",
  "division_id", "division_name", "region_id", "region_name",
  "district_id", "district_name", "complex_id", "costcenter",
  "created_at", "kind_of_waste", "lbs_waste", "waste_destination",
];

// Pick N random items
function getRandomItems(array, n) {
  if (!Array.isArray(array)) return [];
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

const { start, end } = getDateRange(365);
const RANDOM_SAMPLE_COUNT = 5;

const apis = [
  { name: "compass", url: `${BASE_URL}?compass&start=${start}&limit=1000&end=${end}` },
  { name: "complex", url: `${BASE_URL}?complex=C-39043&start=${start}&limit=1000&end=${end}` },
  { name: "district", url: `${BASE_URL}?district=FAJ07&start=${start}&limit=1000&end=${end}` },
  { name: "region", url: `${BASE_URL}?region=VCS000&start=${start}&limit=1000&end=${end}` },
  { name: "division", url: `${BASE_URL}?division=VS0000&start=${start}&limit=1000&end=${end}` },
  { name: "sector", url: `${BASE_URL}?sector=F00000,L00000&start=${start}&limit=1000&end=${end}` },
];

apis.forEach((api) => {
  const filePath = `tests/downloads/${api.name}_${start}_to_${end}.json`;

  test.describe.serial(`Compass API: ${api.name}`, () => {
    test(`Save API response: ${api.name}`, async () => {
      const response = await fetchAuth(api.url);
      expect(response.status).toBe(200);
      const json = JSON.parse(response.body);

      if (json.wastes && Array.isArray(json.wastes)) {
        const randomSamples = getRandomItems(json.wastes, RANDOM_SAMPLE_COUNT);

        console.log(
          `Random ${RANDOM_SAMPLE_COUNT} samples for ${api.name}:`,
          JSON.stringify(randomSamples, null, 2)
        );

        randomSamples.forEach((waste, index) => {
          requiredFields.forEach((field) => {
            expect(waste, `Missing field "${field}" in random waste[${index}]`).toHaveProperty(field);
          });
        });
      }

      fs.mkdirSync("tests/downloads", { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
    });

    test(`Validate random ${RANDOM_SAMPLE_COUNT} API response field values match saved: ${api.name}`, async () => {
      const saved = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const live = await fetchAuth(api.url);
      expect(live.status).toBe(200);
      const liveJson = JSON.parse(live.body);

      const savedRandom = getRandomItems(saved.wastes, RANDOM_SAMPLE_COUNT);

      console.log(
        `Validating random ${RANDOM_SAMPLE_COUNT} samples for ${api.name}:`,
        JSON.stringify(savedRandom, null, 2)
      );

      savedRandom.forEach((savedWaste, index) => {
        const liveWaste = liveJson.wastes.find((w) => w.id === savedWaste.id);
        expect(liveWaste, `Waste with id ${savedWaste.id} not found in live data`).toBeTruthy();

        requiredFields.forEach((field) => {
          expect(liveWaste, `Missing field "${field}" in waste[${index}]`).toHaveProperty(field);
          expect(liveWaste[field], `Mismatch for field "${field}" in waste[${index}]`).toEqual(savedWaste[field]);
        });
      });
    });
  });
});
