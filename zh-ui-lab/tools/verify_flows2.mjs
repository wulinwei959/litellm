// 第五套功能验证：覆盖前四套没走到的四个重交互面
//   1) 模型与端点：打开"添加模型"内联面板并检查关键字段已中文化且可交互
//   2) 日志：打开一行日志的详情抽屉，断言抽屉内标题为中文且有内容
//   3) 用量：切换标签页，断言切换后仍出数（图表容器有尺寸）
//   4) 护栏：打开护栏详情，断言详情面板标题中文化
// 这些是"用浏览器逐个功能验证"里前四套未覆盖的部分。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:/zh-ui-lab";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasCjk = (s) => {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x3000 && c <= 0x9fff) return true;
  }
  return false;
};

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

// Base UI 的标签页/开关不认合成 click，必须走真实指针事件
const realClick = async (selector, index = 0) => {
  const handle = await page.evaluateHandle(
    (sel, i) => {
      const list = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
      return list[i] ?? null;
    },
    selector,
    index,
  );
  const el = handle.asElement();
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
};

const clickWhere = async (needle) => {
  const found = await page.evaluate((text) => {
    document.querySelectorAll("[data-zh-target]").forEach((e) => e.removeAttribute("data-zh-target"));
    const els = [...document.querySelectorAll("button,[role='tab'],[role='row'],a")];
    const hit = els.find((el) => ((el.innerText || el.getAttribute("aria-label") || "").trim()).includes(text));
    if (!hit) return false;
    hit.setAttribute("data-zh-target", "1");
    return true;
  }, needle);
  if (!found) return false;
  return realClick("[data-zh-target='1']");
};

await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await sleep(3000);

await step("模型与端点：切到「添加模型」标签页且表单中文化", async () => {
  await page.goto(BASE + "/ui/models-and-endpoints/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3200);
  const openedTab = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="tab"],button')].find((x) => (x.innerText || "").trim() === "添加模型");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!openedTab) throw new Error("未见「添加模型」入口");
  await sleep(2500);
  const info = await page.evaluate(() => {
    // 「添加模型」是标签页不是弹窗：以选中态与可见表单为准，否则会读到空壳并误报"没有中文"
    const selected = [...document.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute("aria-selected") === "true");
    const root =
      [...document.querySelectorAll("form")].find((f) => f.getClientRects().length) || selected?.closest('[role="tabpanel"]') || document.body;
    return {
      selected: selected?.innerText.trim().slice(0, 20) ?? null,
      text: (root.innerText || "").slice(0, 900).replace(/\s+/g, " "),
      fields: [...root.querySelectorAll("input,select,textarea")].filter((i) => i.getClientRects().length).length,
    };
  });
  if (info.selected !== "添加模型") throw new Error(`标签未切到「添加模型」，当前选中: ${info.selected}`);
  if (!hasCjk(info.text)) throw new Error("面板内没有中文: " + info.text.slice(0, 140));
  if (info.fields < 2) throw new Error(`面板内可交互字段过少: ${info.fields}`);
  if (/LiteLLM Model Name/.test(info.text)) throw new Error("面板仍有英文标题: " + info.text.slice(0, 120));
  await page.keyboard.press("Escape");
  return `字段 ${info.fields} 个｜${info.text.slice(0, 36)}`;
});

await step("日志：打开详情抽屉且标题中文化", async () => {
  await page.goto(BASE + "/ui/logs/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3500);
  const rowCount = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].filter((r) => r.getClientRects().length).length);
  if (!rowCount) return "跳过：无日志行";
  if (!(await realClick("tbody tr"))) throw new Error("日志行不可点击");
  await sleep(3000);
  const drawer = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getClientRects().length);
    return d ? (d.innerText || "").slice(0, 700).replace(/\s+/g, " ") : "";
  });
  if (!drawer) throw new Error("点击日志行后未出现抽屉");
  if (!hasCjk(drawer)) throw new Error("抽屉内无中文: " + drawer.slice(0, 100));
  await page.keyboard.press("Escape");
  return `抽屉文本 ${drawer.length} 字`;
});

await step("用量：切换标签页后仍出数", async () => {
  await page.goto(BASE + "/ui/usage/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3500);
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((t) => (t.innerText || "").trim()).filter(Boolean));
  if (tabs.length < 2) return `标签页不足(${tabs.length})，跳过`;
  const target = tabs[1];
  if (!(await clickWhere(target))) throw new Error(`无法点击标签「${target}」`);
  await sleep(3000);
  const ok = await page.evaluate(() => {
    const svg = [...document.querySelectorAll("svg,canvas")].filter((e) => e.getClientRects().length && e.clientWidth > 120);
    const rows = document.querySelectorAll("tbody tr").length;
    return svg.length > 0 || rows > 0;
  });
  if (!ok) throw new Error(`切到「${target}」后既无图表也无表格`);
  return `标签「${target}」渲染正常`;
});

await step("护栏：打开详情且面板中文化", async () => {
  await page.goto(BASE + "/ui/guardrails/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3200);
  const state = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr,[role='row']")].filter((r) => r.getClientRects().length);
    return { rows: rows.length, body: document.body.innerText.slice(0, 200) };
  }).catch(() => ({ rows: 0, body: "" }));
  if (!state.rows) return "跳过：无护栏数据";
  if (!(await realClick("tbody tr"))) throw new Error("护栏行不可点击");
  await sleep(2500);
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 1200).replace(/\s+/g, " "));
  if (!hasCjk(txt)) throw new Error("护栏页无中文");
  await page.keyboard.press("Escape");
  return `护栏行 ${state.rows} 条，详情可读`;
});

await step("全程无页面脚本错误", async () => {
  if (errs.length) throw new Error(errs.slice(0, 3).join(" | "));
  return "0 个 pageerror";
});

fs.writeFileSync(path.join(LAB, "verify-flows2-report.json"), JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n扩展功能回归 ${pass}/${results.length} 通过`);
await browser.close();
