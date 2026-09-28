// 整站汉化审计：登录 -> 逐页访问 -> 抽取可见英文（含属性文案）+ 控制台错误
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";

const overlay = fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8");
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(overlay)?.[1];
if (!key) throw new Error("overlay 里找不到 LITELLM_MASTER_KEY");

const routes = JSON.parse(fs.readFileSync(path.join(LAB, "pages.json"), "utf8"))
  .filter((r) => !r.includes("oauth/callback"))
  .map((r) => (r.endsWith("/") ? r : r + "/"));

const EXTRACT = `(() => {
  const hasCjk = (s) => { for (const ch of s) { const c = ch.codePointAt(0); if (c >= 0x3000 && c <= 0x9fff) return true; } return false; };
  const CODE_TOKENS = new Set(['import','openai','client','api_key','base_url','response','chat','completions','create','model','messages','role','user','content','print','litellm','LLM','TPM','RPM','ID','SSO','JSON','URL','MCP','AI','models','servers','spend','memories','Month','Project']);
  const isNoise = (t) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return true;
    if (/^[A-Z][a-z]{2} \\d{1,2}, \\d{4}$/.test(t)) return true;
    if (/^\\d{1,2} [A-Z][a-z]{2}, \\d{2}:\\d{2}/.test(t)) return true;
    if (/\\d{2}:\\d{2}:\\d{2}$/.test(t)) return true;
    if (/^["'][^"']*["']$/.test(t)) return true;
    if (/^[\\d.,\\s$%]+m?s?$/.test(t)) return true;
    if (/^[a-z0-9][a-z0-9_.\-/]*$/.test(t) && /[-_.\/]/.test(t)) return true;
    if (/^[a-z]+(-[a-z0-9]+){2,}$/.test(t)) return true;
    if (CODE_TOKENS.has(t)) return true;
    return false;
  };
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.textContent || '').trim();
    if (t.length < 2 || !/[A-Za-z]{2}/.test(t) || hasCjk(t) || isNoise(t)) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT','STYLE','NOSCRIPT','CODE','PRE'].includes(p.tagName)) continue;
    if (!p.getClientRects().length) continue;
    if (p.closest('[hidden],[aria-hidden="true"],template,.hljs,code,pre')) continue;
    seen.add(t.slice(0, 120));
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')) {
    if (!el.getClientRects().length) continue;
    for (const attr of ['placeholder','aria-label','title','alt']) {
      const v = (el.getAttribute(attr) || '').trim();
      if (v.length > 1 && /[A-Za-z]{2}/.test(v) && !hasCjk(v) && !isNoise(v)) seen.add('@' + attr + ':' + v.slice(0, 90));
    }
  }
  return { title: document.title, items: [...seen] };
})()`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1600,1000"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (!/favicon|Download the React|favicon|401|Unauthorized/i.test(t)) errors.push("console: " + t.slice(0, 160));
  }
});

await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"], input#username', { timeout: 20000 });
await page.type('input[name="username"], input#username', "admin");
await page.type('input[name="password"], input#password', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await new Promise((r) => setTimeout(r, 3000));
if (!page.url().includes("/ui")) {
  console.log("登录失败，停在:", page.url());
  await browser.close();
  process.exit(1);
}

const report = {};
for (const route of routes) {
  errors.length = 0;
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  } catch (e) {
    report[route] = { error: "goto: " + String(e.message).slice(0, 80) };
    continue;
  }
  await new Promise((r) => setTimeout(r, 1800));
  const got = await page.evaluate(EXTRACT);
  report[route] = {
    landed: page.url().replace(BASE, ""),
    title: got.title,
    englishCount: got.items.length,
    english: got.items,
    pageErrors: [...new Set(errors)].slice(0, 8),
  };
  console.log(route, "->", got.items.length, "条英文");
}

fs.writeFileSync(path.join(LAB, "audit-report.json"), JSON.stringify(report, null, 1));
const uniq = new Map();
for (const r of Object.values(report)) for (const s of r.english ?? []) uniq.set(s, (uniq.get(s) ?? 0) + 1);
console.log("\n页面数:", Object.keys(report).length, " 去重英文串:", uniq.size);
console.log("高频 Top 40:");
[...uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([s, c]) => console.log(String(c).padStart(3), "|", s));
await browser.close();
