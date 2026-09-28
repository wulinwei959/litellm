// 只读勘察：列出指定页面上的按钮、标签与开关，供功能回归脚本对齐真实文案
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];
const routes = process.argv.slice(2);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await new Promise((r) => setTimeout(r, 3000));

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean).slice(0, 26),
    labels: [...document.querySelectorAll("label")].map((l) => (l.innerText || "").trim()).filter(Boolean).slice(0, 20),
    switches: [...document.querySelectorAll('[role="switch"]')].map((s) => (s.getAttribute("aria-label") || "").slice(0, 60)),
    tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => (t.innerText || "").trim()).filter(Boolean),
  }));
  console.log("\n###", route);
  console.log("按钮:", info.buttons.join(" | "));
  console.log("标签:", info.labels.join(" | "));
  console.log("选项卡:", info.tabs.join(" | "));
  console.log("开关数:", info.switches.length, info.switches.slice(0, 8).join(" / "));
}
await browser.close();
