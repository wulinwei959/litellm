// 交互层汉化核对：点击前后对页面英文集合做差，捕获弹窗、内联面板、标签页、折叠区新暴露的文案。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const TRIGGER = /(新建|添加|创建|管理|设置|编辑|导入|导出|上传|下载|生成|配置|更多|高级|查看|详情|全部|邀请|批量|复制|展开|收起|切换|版本|历史|删除|重置|撤销|启用|停用|发送|提交|保存|列|筛选|排序|测试|诊断|发现|重新|刷新|Connect|Configure|Add|Create|Manage|View|Details|Next|Back|Save|Test|Refresh)/;

const EXTRACT = `(() => {
  const hasCjk = (s) => { for (const ch of s) { const c = ch.codePointAt(0); if (c >= 0x3000 && c <= 0x9fff) return true; } return false; };
  const isNoise = (t) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) return true;
    if (/^[a-z0-9][a-z0-9_.\\/-]*$/.test(t) && !/^(of|here|all|required)$/.test(t)) return true;
    if (/^(https?:\\/\\/|\\$\\{|[0-9.,\\s$%:-]+$)/.test(t)) return true;
    if (/^[A-Za-z0-9_-]+@[A-Za-z0-9.-]+$/.test(t)) return true;
    if (/^(sk-|sk_)/.test(t)) return true;
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
    if (p.closest('[hidden],[aria-hidden="true"],template')) continue;
    seen.add(t.slice(0, 160));
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) {
    if (!el.getClientRects().length) continue;
    for (const a of ['placeholder','aria-label','title']) {
      const v = (el.getAttribute(a) || '').trim();
      if (v.length > 1 && /[A-Za-z]{2}/.test(v) && !hasCjk(v) && !isNoise(v)) seen.add('@' + a + ':' + v.slice(0, 120));
    }
  }
  return [...seen];
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

const routes = JSON.parse(fs.readFileSync(path.join(LAB, "pages.json"), "utf8"))
  .filter((r) => !r.includes("oauth/callback") && !r.includes("/login") && !r.includes("/onboarding"))
  .map((r) => (r.endsWith("/") ? r : r + "/"));

const found = new Map();
const perPage = {};

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1800));
  let before = new Set(await page.evaluate(EXTRACT));
  for (const s of before) found.set(s, (found.get(s) ?? 0) + 1);
  let clicks = 0;
  const clicked = new Set();
  while (clicks < 20) {
    // 每轮重新枚举：上一次点击会让 React 重建 DOM，缓存元素句柄会整体失效
    const cands = await page.evaluate(() =>
      [...document.querySelectorAll("button,[role='tab']")]
        .map((el) => (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 60))
        .filter(Boolean));
    const re = new RegExp(TRIGGER.source);
    const next = cands.find((l) => !clicked.has(l) && re.test(l));
    if (!next) break;
    clicked.add(next);
    const ok = await page.evaluate((label) => {
      const el = [...document.querySelectorAll("button,[role='tab']")].find(
        (e) => ((e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 60)) === label);
      if (!el) return false;
      el.click();
      return true;
    }, next);
    if (!ok) continue;
    clicks += 1;
    await new Promise((r) => setTimeout(r, 1200));
    let after;
    try { after = await page.evaluate(EXTRACT); } catch { await page.keyboard.press("Escape"); continue; }
    const fresh = after.filter((s) => !before.has(s));
    for (const s of fresh) found.set(s, (found.get(s) ?? 0) + 1);
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 400));
    if ((await page.evaluate("location.pathname")) !== route.replace(/\/$/, "")) {
      await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1200));
      before = new Set(await page.evaluate(EXTRACT));
    }
  }
  perPage[route] = { clicks, base: before.size };
  console.log(route, "点击", clicks, "次，基础残留", before.size);
}

const list = [...found.entries()].sort((a, b) => b[1] - a[1]);
fs.writeFileSync(path.join(LAB, "interaction-report.json"), JSON.stringify({ perPage, items: list.map(([t, c]) => ({ text: t, pages: c })) }, null, 1));
console.log("\n交互层累计去重英文串:", list.length);
for (const [t, c] of list.slice(0, 70)) console.log(String(c).padStart(3), "|", t.slice(0, 100));
await browser.close();
