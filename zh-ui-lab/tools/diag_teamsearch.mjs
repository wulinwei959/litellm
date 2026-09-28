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

await page.goto(BASE + "/ui/teams/", { waitUntil: "networkidle2", timeout: 60000 });
await wait(3000);

const inputs = await page.evaluate(() =>
  [...document.querySelectorAll("input")]
    .filter((i) => i.getClientRects().length)
    .map((i) => ({ type: i.type, name: i.name || null, ph: i.placeholder || null, aria: i.getAttribute("aria-label") })),
);
console.log("可见输入框:", JSON.stringify(inputs, null, 1));

const rowsOf = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("tbody tr")].filter((r) => r.getClientRects().length).map((r) => (r.innerText || "").replace(/\s+/g, " ").slice(0, 60)),
  );

console.log("输入前行:", JSON.stringify(await rowsOf(), null, 1));

const typed = await page.evaluate(() => {
  const el = [...document.querySelectorAll("input")].find((i) => i.getClientRects().length && /搜索|search/i.test(i.placeholder || ""));
  if (!el) return null;
  el.focus();
  return el.placeholder;
});
console.log("目标搜索框 placeholder:", typed);
if (typed) {
  await page.keyboard.type("测试");
  for (const d of [1200, 3000, 6000]) {
    await wait(d);
    console.log(
      `+${d}ms 行:`,
      JSON.stringify(await rowsOf()),
      "值:",
      await page.evaluate(() => {
        const el = [...document.querySelectorAll("input")].find((i) => i.getClientRects().length && /搜索|search/i.test(i.placeholder || ""));
        return el?.value ?? null;
      }),
    );
  }
}
await browser.close();
