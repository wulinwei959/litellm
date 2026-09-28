import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1200 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await wait(3000);

await page.goto(BASE + "/ui/models-and-endpoints/", { waitUntil: "networkidle2", timeout: 60000 });
await wait(3500);

const snap = () =>
  page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => ({
      label: (t.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20),
      sel: t.getAttribute("aria-selected"),
    }));
    const panels = [...document.querySelectorAll('[role="tabpanel"]')].map((p) => ({
      hidden: p.hidden || p.getAttribute("hidden") !== null,
      len: (p.innerText || "").length,
      inputs: p.querySelectorAll("input,select,textarea").length,
    }));
    return {
      tabs,
      panels,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).length,
      forms: [...document.querySelectorAll("form")].filter((f) => f.getClientRects().length).length,
      bodyLen: document.body.innerText.length,
      url: location.pathname + location.search,
    };
  });

console.log("点击前:", JSON.stringify(await snap()));
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button,[role='tab']")].find((x) => (x.innerText || "").trim() === "添加模型");
  if (b) b.scrollIntoView({ block: "center" });
  if (!b) return "notfound";
  b.click();
  return b.tagName + "/" + (b.getAttribute("role") || "-");
});
console.log("点击:", clicked);
for (const d of [1500, 4000, 9000]) {
  await wait(d);
  console.log(`+${d}ms:`, JSON.stringify(await snap()));
}
await browser.close();
