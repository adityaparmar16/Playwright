import { test, expect } from "@playwright/test";
import fs from "fs";
import https from "https";

// Utility for formatting dates to YYYY-MM-DD
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
const BASIC_AUTH = Buffer.from("bamco:HwzwlYucR4NMx50EMoFG").toString("base64");

async function fetchWithAuth(url) {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      headers: {
        Authorization: `Basic ${BASIC_AUTH}`,
        "Client-Name": "Wastenot",
        "Client-Key": "Q4N99gjF5ZdrdQzPm7fKpfhKn7zFGQ5m",
      },
    };

    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);
    req.end();
  });
}

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
    const response = await fetchWithAuth(url);
    expect(response.status).toBe(200);
    const json = JSON.parse(response.body);

    // Validate required fields in wastes
    if (json.wastes && Array.isArray(json.wastes)) {
      json.wastes.forEach((waste, index) => {
        requiredFields.forEach((field) => {
          expect(waste, `Missing field "${field}" in waste[${index}]`).toHaveProperty(field);
        });
      });
    }

    fs.mkdirSync("tests/downloads", { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
  });

  test(`Validate API response matches saved: ${api.name}`, async () => {
    const saved = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const live = await fetchWithAuth(url);
    expect(live.status).toBe(200);
    expect(JSON.parse(live.body)).toEqual(saved);
  });
});
