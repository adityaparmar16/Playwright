import { test, expect } from "@playwright/test";
import fs from "fs";
import dotenv from "dotenv";
import { fetchAuth } from "../../../utils/apiHelper.js";

dotenv.config();

const d = n => new Date(Date.now() - n * 864e5).toISOString().split("T")[0],
      start = d(366),
      end = d(1),
      BASE_URL = process.env.COMPASS_PROD_API_URL,
      fields = ["id","tablet_id","profile_id","profile_name","kitchen_id","kitchen_name","sector_id","sector_name","division_id","division_name","region_id","region_name","district_id","district_name","complex_id","costcenter","created_at","kind_of_waste","lbs_waste","waste_destination"],
      sample = (a,n=5) => [...a].sort(() => .5 - Math.random()).slice(0,n);

[
  ["compass","compass"],
  ["complex","complex=C-27833"],
  ["district","district=CKH16"],
  ["region","region=CKH000"],
  ["division","division=CK0000"],
  ["sector","sector=F00000,C00000"]
].forEach(([name,q]) => {

  const url = `${BASE_URL}?${q}&start=${start}&end=${end}&limit=1000`,
        file = `tests/downloads/${name}.json`;

  test(`API ${name}`, async () => {

    const r = await fetchAuth(url);
    expect(r.status).toBe(200);

    const j = JSON.parse(r.body),
          s = sample(j.wastes || []);

    s.forEach(w => fields.forEach(f => expect(w).toHaveProperty(f)));

    fs.mkdirSync("tests/downloads",{ recursive:true });
    fs.writeFileSync(file, JSON.stringify(j,null,2));

    const live = JSON.parse((await fetchAuth(url)).body);

    s.forEach(w => {
      const x = live.wastes.find(v => v.id === w.id);
      fields.forEach(f => expect(x[f]).toEqual(w[f]));
    });
  });
});