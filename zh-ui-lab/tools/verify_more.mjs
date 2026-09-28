// 追加功能验证：邀请用户 + 管理员面板"界面设置"开关落库。
// 这两条走的是与密钥/团队不同的写路径（/user/invite 与 /config），
// 用来证明 244 处接口出口包装与 1947 处标签兜底替换没有把中文回传成入参。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 140)));

const api = async (p, body) => {
  const res = await fetch(BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const getApi = async (p) => {
  const res = await fetch(BASE + p, { headers: { Authorization: "Bearer " + key } });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const dumpForm = async (tag) => {
  const info = await page.evaluate(() => {
    const root = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.getClientRects().length) || document;
    return {
      buttons: [...root.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 16),
      inputs: [...root.querySelectorAll("input,textarea,select")].filter((i) => i.getClientRects().length)
        .map((i) => `${i.type || i.tagName.toLowerCase()}[ph=${i.placeholder || ""}|aria=${(i.getAttribute("aria-label") || "").slice(0, 30)}]`),
      labels: [...root.querySelectorAll("label")].map((l) => (l.innerText || "").trim()).filter(Boolean).slice(0, 16),
    };
  });
  console.log("  " + tag + " 现场:", JSON.stringify(info));
};

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

const clickText = async (needle) => {
  const ok = await page.evaluate((text) => {
    const root = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.getClientRects().length) || document;
    const el = [...root.querySelectorAll("button,[role='tab'],[role='menuitem']")].find(
      (b) => ((b.innerText || b.getAttribute("aria-label") || "").trim()).includes(text));
    if (!el) return false;
    el.click();
    return true;
  }, needle);
  if (!ok) {
    await dumpForm("点击前");
    throw new Error(`找不到文本含「${needle}」的可点元素`);
  }
};

const fillByLabel = async (labelText, value) => {
  const done = await page.evaluate(({ label, val }) => {
    const scope = document.querySelector('[role="dialog"]') || document;
    const inputs = [...scope.querySelectorAll("input,textarea")].filter((i) => i.getClientRects().length);
    const hit = inputs.find((i) => {
      const id = i.getAttribute("id");
      const lab = id && document.querySelector(`label[for="${id}"]`);
      return [lab?.innerText, i.getAttribute("aria-label"), i.getAttribute("placeholder")].some(
        (t) => (t || "").includes(label));
    });
    if (!hit) return false;
    const setter = Object.getOwnPropertyDescriptor(hit.constructor.prototype, "value").set;
    setter.call(hit, val);
    hit.dispatchEvent(new Event("input", { bubbles: true }));
    hit.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { label: labelText, val: value });
  if (!done) throw new Error(`找不到标签含「${labelText}」的输入框`);
};

await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await sleep(3000);

const uid = "zh-crud-" + Date.now().toString(36);

await step("界面邀请用户", async () => {
  await page.goto(BASE + "/ui/users/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2800);
  await clickText("邀请用户");
  await sleep(2000);
  try {
    await fillByLabel("邮箱", `${uid}@example.com`);
  } catch (e) {
    await dumpForm("邀请用户");
    throw e;
  }
  await clickText("邀请用户");
  await sleep(3500);
  const r = await getApi("/user/list");
  const users = Array.isArray(r.json) ? r.json : r.json?.users ?? [];
  const hit = users.find((u) => (u.user_email ?? u.email) === `${uid}@example.com`);
  if (!hit) {
    await dumpForm("邀请用户");
    throw new Error(`接口未查到 ${uid}@example.com`);
  }
  return `已邀请 user_id=${hit.user_id}`;
});

await step("清理邀请的用户", async () => {
  const r = await getApi("/user/list");
  const users = Array.isArray(r.json) ? r.json : r.json?.users ?? [];
  const hit = users.find((u) => (u.user_email ?? u.email) === `${uid}@example.com`);
  if (!hit) return "已不存在";
  const d = await api("/user/delete", { user_ids: [hit.user_id] });
  if (d.status !== 200) throw new Error(`删除用户 HTTP ${d.status} ${JSON.stringify(d.json)?.slice(0, 120)}`);
  return "已删除";
});

await step("切换界面设置里的开关并核持久化", async () => {
  await page.goto(BASE + "/ui/admin-panel/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2600);
  await clickText("界面设置");
  await sleep(2600);
  const schema = await getApi("/get/ui_settings");
  const props = schema.json?.field_schema?.properties ?? {};
  // 开关的 aria-label 已被接口词典换成中文，所以中英文两种说明都要能反查到字段
  const dicts = ["all-zh.json", "api-zh.json", "api-zh11.json", "api-zh12.json", "api-zh13.json", "api-zh14.json"]
    .map((f) => JSON.parse(fs.readFileSync(path.join(LAB, f), "utf8")));
  const zhOf = (t) => {
    for (const d of dicts) if (d[t]) return d[t];
    return t;
  };
  const byDescription = new Map();
  for (const [k, v] of Object.entries(props)) {
    if (!v?.description) continue;
    byDescription.set(v.description, k);
    byDescription.set(zhOf(v.description), k);
  }
  const handle = await page.evaluateHandle(() =>
    [...document.querySelectorAll('[role="switch"]')].find((s) => s.getAttribute("aria-label")) || null);
  const sw = handle.asElement();
  if (!sw) throw new Error("界面设置页没有可切换的开关");
  const picked = { aria: await sw.evaluate((el) => el.getAttribute("aria-label")) };
  // 合成 click() 不触发 Base UI 开关的 onChange，必须走真实指针事件
  await sw.click();
  await sleep(800);
  const state = await sw.evaluate((el) => el.getAttribute("aria-checked"));
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter((t) => t && t.length < 14));
  console.log(`  开关状态=${state} 可见按钮=${buttons.slice(0, 24).join("/")}`);
  const field = byDescription.get(picked.aria);
  if (!field) throw new Error(`开关的说明文本没对上字段: ${picked.aria.slice(0, 40)}`);
  await sleep(4000);
  const after = await getApi("/get/ui_settings");
  const now = Boolean(after.json?.values?.[field]);
  const prev = Boolean(schema.json?.values?.[field]);
  if (now === prev) throw new Error(`${field} 未落库：${prev} -> ${now}`);
  await api("/update/ui_settings", { [field]: prev });
  return `${field} ${prev} -> ${now}，已回滚`;
});

await step("全程无页面脚本错误", async () => {
  if (errs.length) throw new Error(errs.slice(0, 3).join(" | "));
  return "0 个 pageerror";
});

fs.writeFileSync(path.join(LAB, "verify-more-report.json"), JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n追加功能回归 ${pass}/${results.length} 通过`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
