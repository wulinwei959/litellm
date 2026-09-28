// tooltip 悬停探针：逐个触发提示控件，读取弹出的 [role="tooltip"] 文本，报告仍为英文的条目。
// 页面层与交互层审计都不悬停，这一类只能单独验。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const hasCjk = (s) => {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x3000 && c <= 0x9fff) return true;
  }
  return false;
};

const routes = JSON.parse(fs.readFileSync(path.join(LAB, "pages.json"), "utf8"))
  .filter((r) => !r.includes("oauth/callback") && !r.includes("/login"))
  .map((r) => (r.endsWith("/") ? r : r + "/"));

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
await new Promise((r) => setTimeout(r, 3000));

const english = new Map();
const seen = new Set();
let hovered = 0;
let opened = 0;

// 单个触发器：先移开再阶梯靠近，Base UI 才会判定为 pointerenter；弹出后需等待动画与 delay
const hoverTrigger = async (index) => {
  await page.mouse.move(4, 4);
  await new Promise((r) => setTimeout(r, 200));
  const box = await page.evaluate((i) => {
    const list = [...document.querySelectorAll('[data-slot="tooltip-trigger"]')].filter((e) => e.getClientRects().length);
    const el = list[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, index);
  if (!box) return null;
  await page.mouse.move(Math.max(box.x - 40, 2), Math.max(box.y - 40, 2));
  await page.mouse.move(box.x, box.y, { steps: 12 });
  await new Promise((r) => setTimeout(r, 900));
  const tips = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tooltip"], [data-slot="tooltip-content"]')]
      .map((t) => (t.innerText || "").trim().replace(/\s+/g, " ").slice(0, 160))
      .filter(Boolean));
  await page.mouse.move(4, 4);
  await new Promise((r) => setTimeout(r, 250));
  return tips;
};

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  const triggerCount = await page.evaluate(
    () => [...document.querySelectorAll('[data-slot="tooltip-trigger"]')].filter((e) => e.getClientRects().length).length,
  );
  for (let i = 0; i < Math.min(triggerCount, 12); i++) {
    hovered += 1;
    const tips = await hoverTrigger(i);
    for (const t of tips ?? []) {
      if (seen.has(t)) continue;
      seen.add(t);
      opened += 1;
      if (/[A-Za-z]{3}/.test(t) && !hasCjk(t)) english.set(t, (english.get(t) ?? 0) + 1);
    }
  }
}

const list = [...english.entries()].sort((a, b) => b[1] - a[1]);
fs.writeFileSync(path.join(LAB, "verify-tooltip-report.json"), JSON.stringify(list.map(([text, n]) => ({ text, n })), null, 1));
console.log(`悬停 ${hovered} 个触发器，去重弹出提示 ${opened} 条，其中仍为英文 ${list.length} 条`);
if (opened === 0) {
  console.log("!! 探针未取到任何弹出提示，本轮结果不可信");
  process.exitCode = 1;
}
for (const [t, n] of list.slice(0, 40)) console.log(String(n).padStart(3), "|", t.slice(0, 96));
await browser.close();
