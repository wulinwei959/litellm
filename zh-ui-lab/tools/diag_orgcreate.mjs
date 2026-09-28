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

const dump = async (route) => {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await wait(3500);
  const info = await page.evaluate(() => ({
    role: document.body.innerText.match(/账户菜单 — [^\n—]*/)?.[0] ?? null,
    buttons: [...document.querySelectorAll("button")]
      .filter((b) => b.getClientRects().length)
      .map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 26))
      .filter(Boolean),
    rows: [...document.querySelectorAll("tbody tr")].filter((r) => r.getClientRects().length).length,
  }));
  console.log(route, "角色:", info.role, "| 行数:", info.rows);
  console.log("   按钮:", JSON.stringify(info.buttons.slice(0, 40)));
};

await dump("/ui/organizations/");
await dump("/ui/teams/");
await browser.close();
