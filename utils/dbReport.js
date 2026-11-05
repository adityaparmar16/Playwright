// utils/dbReport.js – shared helpers for the DB scripts (CSV export, saving to test-results/)
import fs from "fs";
import path from "path";

/** Rows (array of objects) → CSV text. Every value is quoted, so commas/quotes/newlines in data are safe. */
export const csv = (rows) =>
  !rows?.length
    ? ""
    : [
        Object.keys(rows[0]).join(","),
        ...rows.map((row) =>
          Object.values(row)
            .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");

/** Writes `data` to test-results/<name> (creating the folder) and returns the full path. */
export const save = (name, data) => {
  const filePath = path.join(process.cwd(), "test-results", name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
  return filePath;
};

/** Date → "YYYY-MM-DD HH:MM:SS" (UTC), the format the SQL queries use. */
export const toSqlDateTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");
