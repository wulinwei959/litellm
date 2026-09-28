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
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(m.text().slice(0, 180)); });
page.on("pageerror", (e) => logs.push("PAGEERROR " + String(e.message).slice(0, 180)));
const notfound = new Set();
page.on("response", (r) => { if (r.status() === 404) notfound.add(r.url()); });
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
await wait(3200);
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => b.getClientRects().length && /模型|添加/.test(b.innerText))
    .map((b) => b.innerText.trim().replace(/\s+/g, " ").slice(0, 30)),
);
console.log("候选按钮:", JSON.stringify(buttons));

const marked = await page.evaluate(() => {
  const els = [...document.querySelectorAll("button,[role='tab'],a")];
  const hit = els.find((el) => ((el.innerText || "").trim()).includes("添加模型"));
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  hit.setAttribute("data-zh-target", "1");
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: hit.tagName };
});
console.log("命中:", JSON.stringify(marked));
if (marked) {
  await page.mouse.click(marked.x, marked.y);
  for (const delay of [3000, 8000, 15000]) {
    await wait(delay);
    const snap = await page.evaluate(() => ({
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => ({
        visible: d.getClientRects().length > 0,
        len: (d.innerText || "").length,
        head: (d.innerText || "").replace(/\s+/g, " ").slice(0, 60),
      })),
      bodyLen: document.body.innerText.length,
      bodyHead: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
    }));
    console.log(`点击后约 ${delay}ms:`, JSON.stringify(snap));
  }
}
console.log("404 URL:", JSON.stringify([...notfound].slice(0, 15), null, 1));
console.log("日志:", JSON.stringify(logs.slice(0, 12), null, 1));
await browser.close();
