// utils/apiHelper.js
import https from "https";

// Centralized auth config
const AUTH = {
  BASIC_AUTH: Buffer.from("bamco:HwzwlYucR4NMx50EMoFG").toString("base64"),
  CLIENT_NAME: "Wastenot",
  CLIENT_KEY: "Q4N99gjF5ZdrdQzPm7fKpfhKn7zFGQ5m"
};

// Fetch utility with auth headers
export async function fetchAuth(url) {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      headers: {
        Authorization: `Basic ${AUTH.BASIC_AUTH}`,
        "Client-Name": AUTH.CLIENT_NAME,
        "Client-Key": AUTH.CLIENT_KEY,
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
