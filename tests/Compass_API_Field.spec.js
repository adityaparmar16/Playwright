import { test, expect } from "@playwright/test";
import fs from "fs";
import https from "https";

const BASE_URL = "https://cafemanager-api.cafebonappetit.com/api/wastenot";
const BASIC_AUTH = Buffer.from("bamco:HwzwlYucR4NMx50EMoFG").toString("base64");

// ✅ Utility to format dates as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// ✅ Dynamic date range (till yesterday)
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

// Example: 1 year range ending yesterday
function getDateRange(daysBack = 365) {
  const end = formatDate(yesterday);
  const startDate = new Date(yesterday);
  startDate.setDate(startDate.getDate() - daysBack);
  const start = formatDate(startDate);
  return { start, end };
}

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

// ✅ required fields for Compass API
const requiredFields = [
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

// ✅ Build API list dynamically
const { start, end } = getDateRange(365);

const apis = [
  {
    name: "compass",
    url: `${BASE_URL}?compass&start=${start}&limit=1000&end=${end}`,
  },
  {
    name: "complex",
    url: `${BASE_URL}?complex=C-39043&start=${start}&limit=1000&end=${end}`,
  },
  {
    name: "district",
    url: `${BASE_URL}?district=FAJ07&start=${start}&limit=1000&end=${end}`,
  },
  {
    name: "region",
    url: `${BASE_URL}?region=VCS000&start=${start}&limit=1000&end=${end}`,
  },
  {
    name: "division",
    url: `${BASE_URL}?division=VS0000&start=${start}&limit=1000&end=${end}`,
  },
  {
    name: "sector",
    url: `${BASE_URL}?sector=F00000,L00000&start=${start}&limit=1000&end=${end}`,
  },
];

apis.forEach((api) => {
  const filePath = `tests/downloads/${api.name}_${start}_to_${end}.json`;

  test.describe.serial(`Compass API: ${api.name}`, () => {
    test(`Save API response: ${api.name}`, async () => {
      const response = await fetchWithAuth(api.url);
      expect(response.status).toBe(200);
      const json = JSON.parse(response.body);

      // ✅ Validate only top 5 wastes before saving
      if (json.wastes && Array.isArray(json.wastes)) {
        json.wastes.slice(0, 5).forEach((waste, index) => {
          requiredFields.forEach((field) => {
            expect(
              waste,
              `Missing field "${field}" in waste[${index}]`
            ).toHaveProperty(field);
          });
        });
      }

      fs.mkdirSync("tests/downloads", { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
    });

    test(`Validate top 5 API response field values match saved: ${api.name}`, async () => {
      const saved = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const live = await fetchWithAuth(api.url);
      expect(live.status).toBe(200);
      const liveJson = JSON.parse(live.body);

      // ✅ Take only top 5
      const savedTop5 = saved.wastes.slice(0, 5);
      const liveTop5 = liveJson.wastes.slice(0, 5);

      expect(liveTop5.length).toBe(savedTop5.length);

      // ✅ Compare required fields of top 5
      liveTop5.forEach((waste, index) => {
        const savedWaste = savedTop5[index];
        requiredFields.forEach((field) => {
          expect(waste, `Missing field "${field}" in waste[${index}]`).toHaveProperty(field);
          expect(
            waste[field],
            `Mismatch for field "${field}" in waste[${index}]`
          ).toEqual(savedWaste[field]);
        });
      });
    });
  });
});
