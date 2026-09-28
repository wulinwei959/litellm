// 定位指定英文文案在已部署页面中的 DOM 上下文
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const targets = process.argv.slice(3);
const route = process.argv[2] || "/ui/";

const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))?.[1];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2" });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 40000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await new Promise((r) => setTimeout(r, 3000));
await page.goto(BASE + route, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500));

const found = await page.evaluate((want) => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.textContent || "").trim();
    if (!want.includes(t)) continue;
    const chain = [];
    let el = n.parentElement;
    for (let i = 0; i < 4 && el; i++) {
      chain.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ").slice(0, 3).join(".") : ""));
      el = el.parentElement;
    }
    out.push({ text: t, chain: chain.join(" < "), html: (n.parentElement?.outerHTML || "").slice(0, 260) });
  }
  for (const el of document.querySelectorAll("[aria-label],[title]")) {
    for (const attr of ["aria-label", "title"]) {
      const v = (el.getAttribute(attr) || "").trim();
      if (want.includes(v)) out.push({ text: v + " [" + attr + "]", chain: el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 260) });
    }
  }
  return out;
}, targets);

for (const f of found) console.log(`\n### ${f.text}\n${f.chain}\n${f.html}`);
console.log(`\n共 ${found.length} 处`);
await browser.close();
