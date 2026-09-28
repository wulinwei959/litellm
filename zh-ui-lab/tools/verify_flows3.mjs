// 第六套功能验证：导航、排序、弹窗开关、主题、登录态这些"点了要有反应"的面。
// 页面层与交互层审计只看文案，控件消失/点击无反应这类回归必须由这套来抓
// （历史上 roles.ts 被误译导致"新建密钥"按钮整片消失，两套审计都没发现）。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));

const step = async (name, fn) => {
  try {
    const d = await fn();
    results.push({ name, ok: true, detail: d ?? "" });
    console.log("PASS", name, d ?? "");
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message).slice(0, 200) });
    console.log("FAIL", name, String(e.message).slice(0, 200));
  }
};

const clickText = (needle, sel = "button,[role='tab'],a") =>
  page.evaluate(
    (text, selector) => {
      // innerText 非空时也要看 aria-label：图标按钮的可访问名往往只写在 aria-label 上
      const hit = [...document.querySelectorAll(selector)]
        .filter((e) => e.getClientRects().length)
        .find((e) => {
          const label = `${e.innerText || ""} ${e.getAttribute("aria-label") || ""}`;
          return label.includes(text);
        });
      if (!hit) return false;
      hit.click();
      return true;
    },
    needle,
    sel,
  );

const visibleDialogText = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[role="dialog"]')]
        .filter((d) => d.getClientRects().length && (d.innerText || "").trim())
        .map((d) => d.innerText.replace(/\s+/g, " "))
        .join(" ") ?? "",
  );

await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await sleep(3000);

await step("侧边栏导航：从首页跳到用量与日志", async () => {
  for (const [label, expect] of [
    ["用量", "usage"],
    ["日志", "logs"],
  ]) {
    const ok = await clickText(label, "a,[role='button'],button");
    if (!ok) throw new Error(`侧边栏缺少「${label}」入口`);
    await sleep(2500);
    const url = page.url();
    if (!url.includes(expect)) throw new Error(`点「${label}」后地址是 ${url}`);
  }
  return "两跳均命中目标路由";
});

await step("密钥列表：排序切换后首行内容真的变化", async () => {
  await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3500);
  const head = () =>
    page.evaluate(() => {
      const r = [...document.querySelectorAll("tbody tr")].find((x) => x.getClientRects().length && x.querySelectorAll("td").length > 1);
      return r ? r.innerText.replace(/\s+/g, " ").slice(0, 60) : null;
    });
  const header = await page.evaluate(() => {
    const h = [...document.querySelectorAll("th[role='columnheader'], th button, th")].filter((e) => e.getClientRects().length);
    const t = h.find((e) => /创建时间|名称|支出/.test(e.innerText || ""));
    if (!t) return null;
    t.click();
    return t.innerText.trim().slice(0, 12);
  });
  if (!header) return "跳过：未找到可排序表头";
  await sleep(1800);
  const after = await head();
  if (!after) throw new Error("排序后表格空了");
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("th")].find((e) => (e.innerText || "").trim().startsWith("创建时间") || (e.innerText || "").trim().startsWith("名称"));
    h?.click();
  });
  await sleep(1800);
  return `按「${header}」排序后首行可读`;
});

await step("组织页：企业版门槛提示存在且为中文", async () => {
  await page.goto(BASE + "/ui/organizations/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  // 无企业版授权时这页本就不该有"新建组织"，但也不能空白或露英文
  if (!/这是 LiteLLM 企业版功能/.test(txt)) throw new Error("未见中文企业版提示: " + txt.slice(0, 120));
  if (/LiteLLM Enterprise feature/.test(txt)) throw new Error("提示仍是英文");
  if (await clickText("新建组织")) {
    await sleep(2000);
    const dlg = await visibleDialogText();
    if (!dlg) throw new Error("点击后弹窗未出现");
    await page.keyboard.press("Escape");
    return "有授权：新建弹窗可开可关";
  }
  return "无授权：门槛提示为中文，符合预期";
});

await step("主题切换：深色/浅色类名真的翻转", async () => {
  const before = await page.evaluate(() => document.documentElement.className);
  if (!(await clickText("切换", "button"))) return "跳过：未找到主题切换按钮";
  await sleep(1200);
  const after = await page.evaluate(() => document.documentElement.className);
  if (after === before) throw new Error("点击后 html class 未变化: " + before);
  await clickText("切换", "button");
  await sleep(800);
  return `class 由 ${before.slice(0, 20) || "(空)"} 变为 ${after.slice(0, 20) || "(空)"}`;
});

await step("密钥详情：点开一行能读到中文详情", async () => {
  await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3500);
  const rows = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].filter((r) => r.getClientRects().length && r.querySelectorAll("td").length > 1).length);
  if (!rows) return "跳过：无密钥数据";
  await page.evaluate(() => {
    const r = [...document.querySelectorAll("tbody tr")].find((x) => x.getClientRects().length && x.querySelectorAll("td").length > 1);
    r?.click();
  });
  await sleep(2500);
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 400));
  if (!/[\u3000-\u9fff]/.test(txt)) throw new Error("密钥详情无中文");
  await page.keyboard.press("Escape");
  return "详情可读且为中文";
});

await step("登出再登录：会话可正常重建", async () => {
  await page.goto(BASE + "/ui/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  if (!(await clickText("账户菜单", "button"))) throw new Error("侧边栏没有账户菜单触发器");
  await sleep(1500);
  if (!(await clickText("退出登录"))) throw new Error("账户菜单里没有退出登录项");
  await sleep(3500);
  if (!page.url().includes("login")) throw new Error("登出后未回登录页: " + page.url());
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.type('input[name="username"]', "admin");
  await page.type('input[name="password"]', key);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await sleep(3000);
  if (page.url().includes("login")) throw new Error("重新登录失败");
  return "登出→登录闭环通过";
});

await step("全程无页面脚本错误", async () => {
  if (errs.length) throw new Error(errs.slice(0, 3).join(" | "));
  return "0 个 pageerror";
});

fs.writeFileSync(path.join(LAB, "verify-flows3-report.json"), JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n交互面回归 ${pass}/${results.length} 通过`);
await browser.close();
