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
await page.setViewport({ width: 1680, height: 1000 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await wait(3000);

for (const route of ["/ui/models-and-endpoints/", "/ui/caching/", "/ui/guardrails/"]) {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await wait(2500);
  const counts = await page.evaluate(() => ({
    slot: document.querySelectorAll('[data-slot="tooltip-trigger"]').length,
    visible: [...document.querySelectorAll('[data-slot="tooltip-trigger"]')].filter((e) => e.getClientRects().length).length,
    describedby: document.querySelectorAll("[aria-describedby]").length,
    popupSlot: document.querySelectorAll('[data-slot="tooltip-content"]').length,
  }));
  console.log(route, JSON.stringify(counts));
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-slot="tooltip-trigger"]')].find((e) => e.getClientRects().length);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) continue;
  await page.mouse.move(box.x - 40, box.y - 40);
  await wait(120);
  await page.mouse.move(box.x, box.y, { steps: 12 });
  await wait(1200);
  const after = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="tooltip"],[data-slot="tooltip-content"]')];
    return {
      popups: t.length,
      text: t.map((e) => (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 120)),
      states: t.map((e) => e.getAttribute("data-state")),
    };
  });
  console.log("   hover ->", JSON.stringify(after));
}
await browser.close();
