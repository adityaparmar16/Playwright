import {test, expect} from "@playwright/test";
import fs from "fs";
import {fetchAuth} from "../../../utils/apiHelper.js";

// Utility for formatting dates
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Dynamic dates (yesterday as end date, 1 year back as start)
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const oneYearAgo = new Date(yesterday);
oneYearAgo.setFullYear(yesterday.getFullYear() - 1);

const startDate = formatDate(oneYearAgo);
const endDate = formatDate(yesterday);

const BASE_URL = "https://cafemanager-api.cafebonappetit.com/api/wastenot";

// Utility: pick N random items
function getRandomItems(array, n) {
  if (!Array.isArray(array)) return [];
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

const RANDOM_SAMPLE_COUNT = 5;

// APIs with dynamic date range
const apis = [
  { name: "non_entry_id", params: { sector: "A0000", start: startDate, end: endDate, limit: "1000", bamco: "1" } },
  { name: "app_date", params: { sector: "A0000", start: startDate, end: endDate, limit: "1000", bamco: "1", app_date: "1" } },
  { name: "pagination", params: { campus: "141", start: startDate, end: endDate, limit: "1000", bamco: "1", page: "2" } },
  { name: "campus", params: { campus: "141", start: startDate, end: endDate, limit: "1000", bamco: "1" } },
  { name: "district", params: { district: "70", start: startDate, end: endDate, limit: "1000", bamco: "1" } },
  { name: "region", params: { region: "11", start: startDate, end: endDate, limit: "1000", bamco: "1" } },
  { name: "account", params: { account: "531", start: startDate, end: endDate, limit: "1000", bamco: "1" } },
];

// Required fields for validation
const requiredFields = [
  "id", "division_name", "tablet_id", "profile_id", "profile_name",
  "kitchen_id", "kitchen_name", "region_id", "region_name",
  "district_id", "district_name", "account_id", "account_name",
  "campus_id", "campus_name", "costcenter", "costcenter_name",
  "created_at", "kind_of_waste", "lbs_waste", "waste_destination",
  "sector_id", "sector_name"
];

apis.forEach((api) => {
  const query = new URLSearchParams(api.params).toString();
  const url = `${BASE_URL}?${query}`;
  const filePath = `tests/downloads/bamco_${api.name}_${startDate}_to_${endDate}.json`;

  test(`Save API response: ${api.name}`, async () => {
    const response = await fetchAuth(url);
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
    const live = await fetchAuth(url);
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
