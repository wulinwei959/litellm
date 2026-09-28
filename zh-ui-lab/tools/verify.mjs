// 汉化后功能回归验证：逐页检查渲染与控制台错误，再跑核心交互流程。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const routes = JSON.parse(fs.readFileSync(path.join(LAB, "pages.json"), "utf8"))
  .filter((r) => !r.includes("oauth/callback") && !r.includes("/login") && !r.includes("/onboarding"))
  .map((r) => (r.endsWith("/") ? r : r + "/"));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const problems = [];
let consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e.message).slice(0, 140)));
page.on("console", (m) => {
  if (m.type() === "error") {
    const t = m.text();
    if (!/favicon|Download the React|401|Unauthorized|404 \(Not Found\)/i.test(t)) consoleErrors.push("console: " + t.slice(0, 140));
  }
});

await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await new Promise((r) => setTimeout(r, 3000));
const loggedIn = page.url().includes("/ui") && !page.url().includes("/login");
console.log("登录:", loggedIn ? "成功" : "失败", page.url());
if (!loggedIn) { await browser.close(); process.exit(1); }

const results = [];
for (const route of routes) {
  consoleErrors = [];
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  } catch (e) {
    results.push({ route, ok: false, why: "goto " + String(e.message).slice(0, 60) });
    continue;
  }
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
    controls: document.querySelectorAll("button,input,select,a").length,
    cjk: /[　-鿿]/.test(document.body.innerText),
  }));
  const row = { route, ok: info.controls > 3 && info.cjk, controls: info.controls, errors: [...new Set(consoleErrors)].slice(0, 3) };
  if (!row.ok) row.why = `controls=${info.controls} cjk=${info.cjk}`;
  if (row.errors.length) row.ok = false;
  results.push(row);
  console.log((row.ok ? "PASS" : "FAIL"), route, row.controls ?? "", row.why ?? "", row.errors?.join(" | ") ?? "");
}

// 核心交互：打开新建密钥弹窗、切换标签、使用搜索框
const flows = [];
async function tryFlow(name, fn) {
  consoleErrors = [];
  try {
    await fn();
    flows.push({ name, ok: consoleErrors.length === 0, errors: [...new Set(consoleErrors)].slice(0, 2) });
  } catch (e) {
    flows.push({ name, ok: false, errors: [String(e.message).slice(0, 120)] });
  }
  const f = flows.at(-1);
  console.log(f.ok ? "PASS" : "FAIL", "流程:", name, f.errors.join(" | "));
}

await tryFlow("api-keys 打开新建密钥弹窗", async () => {
  await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
  const btns = await page.$$("button");
  for (const b of btns) {
    const t = await b.evaluate((el) => el.innerText.trim());
    if (t.includes("新建密钥")) { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 2500));
  const dlg = await page.evaluate(
    () =>
      [...document.querySelectorAll('[role="dialog"]')]
        .find((d) => d.getClientRects().length && (d.innerText || "").trim())?.innerText.slice(0, 120) ?? null,
  );
  if (!dlg) throw new Error("弹窗未打开");
  if (!/[\u3000-\u9fff]/.test(dlg)) throw new Error("弹窗内没有中文: " + dlg.replace(/\s+/g, " ").slice(0, 70));
  console.log("   弹窗首行:", dlg.replace(/\s+/g, " ").slice(0, 70));
  await page.keyboard.press("Escape");
});

await tryFlow("usage 切换标签页", async () => {
  await page.goto(BASE + "/ui/usage/", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  for (const label of ["模型活动", "密钥活动"]) {
    // 只点击不断言等于没测：必须确认标签进入选中态、面板真的出了内容
    const clickedTab = await page.evaluate((text) => {
      const el = [...document.querySelectorAll("button,[role=tab]")].find((x) => (x.innerText || "").trim() === text);
      if (!el) return false;
      el.click();
      return true;
    }, label);
    if (!clickedTab) throw new Error(`未找到标签「${label}」`);
    await new Promise((r) => setTimeout(r, 2200));
    const view = await page.evaluate(() => {
      const sel = [...document.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute("aria-selected") === "true");
      const charts = [...document.querySelectorAll("svg,canvas")].filter((e) => e.getClientRects().length && e.clientWidth > 120).length;
      return { selected: sel?.innerText.trim().slice(0, 20) ?? null, charts, rows: document.querySelectorAll("tbody tr").length };
    });
    if (view.selected !== label) throw new Error(`「${label}」未选中，当前 ${view.selected}`);
    if (!view.charts && !view.rows) throw new Error(`切到「${label}」后既无图表也无表格`);
    console.log(`   ${label}: 选中，图表 ${view.charts} 个，表格 ${view.rows} 行`);
  }
});

await tryFlow("teams 搜索框输入", async () => {
  await page.goto(BASE + "/ui/teams/", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
  const before = await page.evaluate(() => document.querySelectorAll("tbody tr").length);
  const input = await page.$('input[type="search"], input[placeholder*="搜索"]');
  if (!input) throw new Error("未找到搜索框");
  await input.type("测试");
  await new Promise((r) => setTimeout(r, 1500));
  // 断言过滤真的生效：值回读 + 数据行要么为空、要么都含关键字
  // 空态提示（"未找到团队"）也是一行 tbody tr，按单元格数排除，否则会把正常空态误判成"过滤没生效"
  const dataRows = () =>
    page.evaluate((needle) => {
      const el = [...document.querySelectorAll('input[type="search"], input[placeholder*="搜索"]')][0];
      const rows = [...document.querySelectorAll("tbody tr")].filter(
        (r) => r.getClientRects().length && r.querySelectorAll("td").length > 1,
      );
      return {
        value: el?.value ?? null,
        rows: rows.length,
        allMatch: rows.every((r) => (r.innerText || "").includes(needle)),
      };
    }, "测试");
  const state = await dataRows();
  if (state.value !== "测试") throw new Error(`搜索框未收到输入: ${state.value}`);
  if (state.rows > before) throw new Error(`输入关键字后行数反增: ${before} -> ${state.rows}`);
  if (state.rows > 0 && !state.allMatch) throw new Error("过滤未生效，列表里仍有不匹配的行");
  console.log(`   数据行 ${before} -> ${state.rows}`);
});

await tryFlow("models-and-endpoints 打开添加模型", async () => {
  await page.goto(BASE + "/ui/models-and-endpoints/", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
  const btns = await page.$$("button");
  let clicked = false;
  for (const b of btns) {
    const t = await b.evaluate((el) => el.innerText.trim());
    // 用合成点击：真实指针点击会被页面上的反馈浮层拦下（el.click 直达目标）
    if (t === "添加模型" || t === "新建模型") { await b.evaluate((el) => el.click()); clicked = true; break; }
  }
  if (!clicked) throw new Error("未找到添加模型按钮");
  await new Promise((r) => setTimeout(r, 2500));
  // 「模型信息」等标签常驻页面，用它判"界面出现"是空断言；改判标签选中态 + 可见表单
  const state = await page.evaluate(() => {
    const selected = [...document.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute("aria-selected") === "true");
    const form = [...document.querySelectorAll("form")].find((f) => f.getClientRects().length);
    return {
      selected: selected?.innerText.trim().slice(0, 20) ?? null,
      fields: form ? [...form.querySelectorAll("input,select,textarea")].filter((i) => i.getClientRects().length).length : 0,
      text: (form?.innerText ?? "").slice(0, 80).replace(/\s+/g, " "),
    };
  });
  if (state.selected !== "添加模型") throw new Error(`「添加模型」标签未进入选中态: ${state.selected}`);
  if (state.fields < 2) throw new Error(`添加模型表单可见字段过少: ${state.fields}`);
  console.log("   添加模型首行:", state.text);
  await page.keyboard.press("Escape");
});

fs.writeFileSync(path.join(LAB, "verify-report.json"), JSON.stringify({ results, flows }, null, 1));
const passPages = results.filter((r) => r.ok).length;
console.log(`\n页面: ${passPages}/${results.length} 通过   交互流程: ${flows.filter((f) => f.ok).length}/${flows.length} 通过`);
await browser.close();
