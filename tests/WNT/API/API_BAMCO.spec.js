import { test, expect } from "@playwright/test";
import fs from "fs";
import dotenv from "dotenv";
import { fetchAuth } from "../../../utils/apiHelper.js";

dotenv.config();

const d = n => new Date(Date.now() - n * 864e5).toISOString().split("T")[0],
      end = d(1),
      start = d(366),
      BASE_URL = process.env.BAMCO_PROD_API_URL,
      fields = ["id","division_name","tablet_id","profile_id","profile_name","kitchen_id","kitchen_name","region_id","region_name","district_id","district_name","account_id","account_name","campus_id","campus_name","costcenter","costcenter_name","created_at","kind_of_waste","lbs_waste","waste_destination","sector_id","sector_name"],
      sample = (a,n=5) => [...a].sort(() => .5 - Math.random()).slice(0,n),
      common = { start, end, limit: "1000", bamco: "1" };

[
  ["non_entry_id",{ sector:"A0000" }],
  ["app_date",{ sector:"A0000", app_date:"1" }],
  ["pagination",{ campus:"141", page:"2" }],
  ["campus",{ campus:"141" }],
  ["district",{ district:"70" }],
  ["region",{ region:"11" }],
  ["account",{ account:"531" }]
].forEach(([name, params]) => {

  const url = `${BASE_URL}?${new URLSearchParams({ ...common, ...params })}`,
        file = `tests/downloads/${name}.json`;

  test(`API ${name}`, async () => {

    const r = await fetchAuth(url);
    expect(r.status).toBe(200);

    const j = JSON.parse(r.body),
          s = sample(j.wastes || []);

    s.forEach(w => fields.forEach(f => expect(w).toHaveProperty(f)));

    fs.mkdirSync("tests/downloads", { recursive: true });
    fs.writeFileSync(file, JSON.stringify(j, null, 2));

    const live = JSON.parse((await fetchAuth(url)).body);

    sample(j.wastes || []).forEach(w => {
      const x = live.wastes.find(v => v.id === w.id);
      fields.forEach(f => expect(x[f]).toEqual(w[f]));
    });
  });
});