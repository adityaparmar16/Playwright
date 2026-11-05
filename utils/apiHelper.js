// utils/apiHelper.js
import https from "https";
import dotenv from "dotenv";

dotenv.config();

/** Returns process.env[name] or throws a clear error naming the missing variable. */
export function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable "${name}" – add it to .env`);
  }
  return value;
}

function authHeaders() {
  const user = requireEnv("API_BASIC_USERNAME");
  const pass = requireEnv("API_BASIC_PASSWORD");
  return {
    Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
    "Client-Name": requireEnv("CLIENT_NAME"),
    "Client-Key": requireEnv("CLIENT_KEY"),
  };
}

/**
 * GET a URL with the API auth headers.
 * Resolves { status, body }. Rejects on network error or when no response arrives within timeoutMs.
 */
export async function fetchAuth(url, { timeoutMs = 90000 } = {}) {
  const headers = authHeaders();

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * fetchAuth with retries on a non-200 status or a thrown error (network hiccup, timeout, 5xx/429).
 * Returns the last response if all attempts were non-200 so the caller's assertion reports it.
 */
export async function fetchWithRetry(url, { attempts = 3, delayMs = 5000, timeoutMs = 90000 } = {}) {
  let lastResponse;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchAuth(url, { timeoutMs });
      if (response.status === 200) return response;
      lastResponse = response;
      console.log(`⚠️ Attempt ${attempt}/${attempts} returned status ${response.status}` +
        (attempt < attempts ? ` — retrying in ${delayMs}ms` : ""));
    } catch (err) {
      lastError = err;
      console.log(`⚠️ Attempt ${attempt}/${attempts} threw: ${err.message}` +
        (attempt < attempts ? ` — retrying in ${delayMs}ms` : ""));
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (lastResponse) return lastResponse;
  throw lastError;
}

/**
 * Parses a response body as JSON and checks it has a non-empty `wastes` array.
 * Throws readable errors (status + start of body) instead of a bare JSON/undefined error.
 */
export function parseWastes(response, label = "API") {
  if (response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}. Body: ${String(response.body).slice(0, 500)}`);
  }
  let json;
  try {
    json = JSON.parse(response.body);
  } catch {
    throw new Error(`${label} returned invalid JSON. Body: ${String(response.body).slice(0, 500)}`);
  }
  if (!Array.isArray(json.wastes)) {
    throw new Error(`${label} response has no "wastes" array. Keys: ${Object.keys(json).join(", ")}`);
  }
  return json;
}

const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
// Parses weights like 3.76, "3.76" or "3.76 lbs" / "1.2 kg" (the API sends them with a unit).
// Returns the number, or NaN if the value isn't a weight.
const parseWeight = (v) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const m = v.trim().match(/^(-?\d+(?:\.\d+)?)\s*(lbs?|kgs?)?$/i);
  return m ? Number(m[1]) : NaN;
};

/**
 * Type/sanity checks for one waste record. Returns a list of problems (empty = OK),
 * so a failure shows every bad field at once.
 * @param {object} record
 * @param {{ start?: string, end?: string, idFields?: string[] }} opts  start/end as YYYY-MM-DD
 */
export function validateWasteRecord(record, { start, end, idFields = ["id", "tablet_id", "profile_id", "kitchen_id"] } = {}) {
  const problems = [];

  for (const f of idFields) {
    if (isBlank(record[f])) problems.push(`${f} is empty (${JSON.stringify(record[f])})`);
  }

  const lbs = parseWeight(record.lbs_waste);
  if (!Number.isFinite(lbs)) {
    problems.push(`lbs_waste is not a weight (${JSON.stringify(record.lbs_waste)})`);
  } else if (lbs < 0) {
    problems.push(`lbs_waste is negative (${record.lbs_waste})`);
  }

  const created = new Date(record.created_at);
  if (isBlank(record.created_at) || Number.isNaN(created.getTime())) {
    problems.push(`created_at is not a valid date (${JSON.stringify(record.created_at)})`);
  } else if (start && end) {
    // 1 day of slack either side for timezone differences between API and test machine
    const from = new Date(`${start}T00:00:00Z`).getTime() - 864e5;
    const to   = new Date(`${end}T23:59:59Z`).getTime() + 864e5;
    if (created.getTime() < from || created.getTime() > to) {
      problems.push(`created_at ${record.created_at} is outside requested range ${start}..${end}`);
    }
  }

  for (const f of ["kind_of_waste", "waste_destination"]) {
    if (isBlank(record[f])) problems.push(`${f} is empty (${JSON.stringify(record[f])})`);
  }

  return problems;
}
