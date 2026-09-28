// 在已登录会话里打开新建密钥弹窗，定位文本 "required" 的 DOM 上下文
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];
const want = process.argv[2] || "required";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await new Promise((r) => setTimeout(r, 3000));
await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2600));
const btn = await page.evaluateHandle(() =>
  [...document.querySelectorAll("button")].find((b) => (b.innerText || "").includes("新建密钥")));
if (btn.asElement()) await btn.asElement().click();
await new Promise((r) => setTimeout(r, 2200));

const hits = await page.evaluate((needle) => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.textContent || "").trim();
    if (t !== needle) continue;
    let el = n.parentElement;
    const chain = [];
    for (let i = 0; i < 3 && el; i++) {
      chain.push(el.tagName.toLowerCase() + "." + String(el.className || "").split(" ").slice(0, 2).join("."));
      el = el.parentElement;
    }
    out.push({ chain: chain.join(" < "), html: (n.parentElement?.parentElement?.outerHTML || "").slice(0, 420) });
  }
  return out;
}, want);
for (const h of hits) console.log("\n###", want, "\n", h.chain, "\n", h.html);
console.log("\n命中", hits.length, "处");
await browser.close();
