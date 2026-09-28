// 关键页面截图留证：登录 -> 逐页截图 -> 打开密钥弹窗截图
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];
const SHOTS = path.join(LAB, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const pages = [
  ["01-首页", "/ui/"],
  ["02-模型与端点", "/ui/models-and-endpoints/"],
  ["03-成本优化", "/ui/cost-optimization/"],
  ["04-管理员面板", "/ui/admin-panel/"],
  ["05-日志", "/ui/logs/"],
  ["06-路由设置", "/ui/router-settings/"],
  ["07-用量", "/ui/usage/"],
  ["08-护栏", "/ui/guardrails/"],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await new Promise((r) => setTimeout(r, 3000));

for (const [name, route] of pages) {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2600));
  await page.screenshot({ path: path.join(SHOTS, name + ".png") });
  console.log("截图", name, route);
}

await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2600));
const btn = await page.evaluateHandle(() =>
  [...document.querySelectorAll("button")].find((b) => (b.innerText || "").includes("新建密钥")));
if (btn.asElement()) {
  await btn.asElement().click();
  await new Promise((r) => setTimeout(r, 2200));
  await page.screenshot({ path: path.join(SHOTS, "09-新建密钥弹窗.png") });
  console.log("截图 09-新建密钥弹窗");
}
await browser.close();
