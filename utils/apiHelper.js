// utils/apiHelper.js
import https from "https";
import dotenv from "dotenv";

dotenv.config();

// Centralized auth config from env
const AUTH = {
  BASIC_AUTH: Buffer.from(
    `${process.env.API_BASIC_USERNAME}:${process.env.API_BASIC_PASSWORD}`
  ).toString("base64"),

  CLIENT_NAME: process.env.CLIENT_NAME,
  CLIENT_KEY: process.env.CLIENT_KEY,
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

      res.on("end", () =>
        resolve({
          status: res.statusCode,
          body: data,
        })
      );
    });

    req.on("error", reject);
    req.end();
  });
}