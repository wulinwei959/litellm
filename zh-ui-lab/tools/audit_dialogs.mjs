// 弹窗/抽屉/标签页层面的汉化核对：点开每个页面的主要按钮，抽取其中残留英文。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const TARGETS = [
  "/ui/api-keys/", "/ui/models-and-endpoints/", "/ui/teams/", "/ui/users/",
  "/ui/organizations/", "/ui/budgets/", "/ui/guardrails/", "/ui/mcp-servers/",
  "/ui/policies/", "/ui/vector-stores/", "/ui/projects/", "/ui/agents/",
  "/ui/access-groups/", "/ui/prompts/", "/ui/skills/", "/ui/tag-management/",
  "/ui/router-settings/", "/ui/cost-tracking/", "/ui/admin-panel/", "/ui/usage/",
];
const TRIGGER = /(新建|添加|创建|管理|设置|编辑|导入|生成|配置|更多|高级|New|Add|Create|Edit|Import|Settings)/;

const EXTRACT = `(() => {
  const hasCjk = (s) => { for (const ch of s) { const c = ch.codePointAt(0); if (c >= 0x3000 && c <= 0x9fff) return true; } return false; };
  const isNoise = (t) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return true;
    if (/^[a-z0-9][a-z0-9_.\\/-]*$/.test(t)) return true;
    if (/^(https?:\\/\\/|\\$\\{|[0-9.,\\s$%]+$)/.test(t)) return true;
    return false;
  };
  const root = document.querySelector('[role="dialog"]') || document;
  const seen = new Set();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.textContent || '').trim();
    if (t.length < 2 || !/[A-Za-z]{2}/.test(t) || hasCjk(t) || isNoise(t)) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT','STYLE','NOSCRIPT','CODE','PRE'].includes(p.tagName)) continue;
    if (!p.getClientRects().length) continue;
    if (p.closest('[hidden],[aria-hidden="true"],template')) continue;
    seen.add(t.slice(0, 110));
  }
  for (const el of root.querySelectorAll('[placeholder],[aria-label]')) {
    if (!el.getClientRects().length) continue;
    for (const a of ['placeholder','aria-label']) {
      const v = (el.getAttribute(a) || '').trim();
      if (v.length > 1 && /[A-Za-z]{2}/.test(v) && !hasCjk(v) && !isNoise(v)) seen.add('@' + a + ':' + v.slice(0, 90));
    }
  }
  return { dialog: !!document.querySelector('[role="dialog"]'), items: [...seen] };
})()`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await new Promise((r) => setTimeout(r, 3000));

const report = {};
const globalSeen = new Map();
for (const route of TARGETS) {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  const base = await page.evaluate(EXTRACT);
  const opened = [];
  const buttons = await page.$$("button");
  for (const b of buttons.slice(0, 14)) {
    let label = "";
    try { label = await b.evaluate((el) => el.innerText.trim()); } catch { continue; }
    if (!label || !TRIGGER.test(label)) continue;
    try { await b.click(); } catch { continue; }
    await new Promise((r) => setTimeout(r, 1400));
    let got;
    try { got = await page.evaluate(EXTRACT); } catch { got = null; }
    if (!got) { await page.keyboard.press("Escape"); continue; }
    if (got.dialog) {
      opened.push({ label, count: got.items.length, items: got.items });
      for (const s of got.items) globalSeen.set(s, (globalSeen.get(s) ?? 0) + 1);
    }
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));
    if (opened.length >= 3) break;
  }
  report[route] = { pageItems: base.items.length, dialogs: opened.map((o) => ({ label: o.label, count: o.count })) };
  console.log(route, "页面", base.items.length, "弹窗:", opened.map((o) => `${o.label}(${o.count})`).join(", "));
}

fs.writeFileSync(path.join(LAB, "dialog-report.json"), JSON.stringify({ report, globalSeen: [...globalSeen.keys()] }, null, 1));
console.log("\n弹窗层去重英文串:", globalSeen.size);
for (const [s, c] of [...globalSeen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(String(c).padStart(3), "|", s.slice(0, 95));
await browser.close();
