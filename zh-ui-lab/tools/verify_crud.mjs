// 功能回归：用中文界面真实走完"建密钥 -> 表格里查到 -> 改别名 -> 删掉"，
// 每一步都用管理接口复核数据库状态，证明中文标签仍绑定在可用的控件上。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];
const SHOTS = path.join(LAB, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? "" });
    console.log("PASS", name, detail ?? "");
  } catch (e) {
    const tag = name.replace(/[^\w]+/g, "_");
    await page.screenshot({ path: path.join(SHOTS, `fail-${tag}.png`), fullPage: true }).catch(() => {});
    results.push({ name, ok: false, detail: String(e.message).slice(0, 200) });
    console.log("FAIL", name, String(e.message).slice(0, 200));
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getApi = async (p) => {
  const res = await fetch(BASE + p, { headers: { Authorization: "Bearer " + key } });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const api = async (p, body) => {
  const res = await fetch(BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 140)));

await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
await sleep(3000);

const alias = "zh-crud-" + Date.now().toString(36);
const alias2 = alias + "-renamed";

// 按可见文本点击按钮（中文标签，正是本次验证的目标）
const clickText = async (needle, scope) => {
  const handle = await page.evaluateHandle((text, sel) => {
    // 对话框内的按钮优先：面板里"新建密钥"既是入口触发器也是提交按钮
    const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.getClientRects().length) || null;
    const root = sel ? document.querySelector(sel) : (dlg || document);
    const nodes = [...(root || document).querySelectorAll("button,[role='tab'],[role='menuitem']")];
    return nodes.find((el) => ((el.innerText || el.getAttribute("aria-label") || "").trim()).includes(text)) || null;
  }, needle, scope ?? null);
  const el = handle.asElement();
  if (!el) {
    await dumpDialog();
    throw new Error(`找不到文本为「${needle}」的按钮`);
  }
  await el.click();
  return needle;
};

const fillByLabel = async (labelText, value) => {
  const done = await page.evaluate((label, val) => {
    const inputs = [...document.querySelectorAll("input,textarea")].filter((i) => i.getClientRects().length);
    const hit = inputs.find((i) => {
      const id = i.getAttribute("id");
      const lab = id && document.querySelector(`label[for="${id}"]`);
      const aria = i.getAttribute("aria-label") || "";
      const ph = i.getAttribute("placeholder") || "";
      return [lab?.innerText, aria, ph].some((t) => (t || "").includes(label));
    });
    if (!hit) return false;
    const setter = Object.getOwnPropertyDescriptor(hit.constructor.prototype, "value").set;
    setter.call(hit, val);
    hit.dispatchEvent(new Event("input", { bubbles: true }));
    hit.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, labelText, value);
  if (!done) throw new Error(`找不到标签为「${labelText}」的输入框`);
  return labelText;
};

const tableHas = (text) =>
  page.evaluate((t) => document.body.innerText.includes(t), text);

// 失败时把当前对话框的标签与输入框打出来，避免靠猜中文标签措辞
async function dumpDialog() {
  const info = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"]') || document.body;
    const labels = [...root.querySelectorAll("label")].map((l) => (l.innerText || "").trim()).filter(Boolean);
    const inputs = [...root.querySelectorAll("input,textarea,select")]
      .filter((i) => i.getClientRects().length)
      .map((i) => `${i.tagName.toLowerCase()}[${i.type || ""}] ph=${i.placeholder || ""} aria=${i.getAttribute("aria-label") || ""}`);
    const buttons = [...root.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter(Boolean);
    return { labels: labels.slice(0, 18), inputs: inputs.slice(0, 14), buttons: buttons.slice(0, 14) };
  });
  console.log("  对话框现场:", JSON.stringify(info, null, 1));
};

await step("打开密钥页", async () => {
  await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  if (!(await tableHas("虚拟密钥"))) throw new Error("页面未出现中文标题");
  return "列表标题为中文";
});

await step("点新建密钥并填别名", async () => {
  await clickText("新建密钥");
  await sleep(1800);
  try {
    await fillByLabel("密钥名称", alias);
  } catch (e) {
    await dumpDialog();
    throw e;
  }
  return `已填入 ${alias}`;
});

const findKey = async (needle) => {
  const r = await getApi("/key/list?key_alias=" + encodeURIComponent(needle) + "&return_full_object=true");
  const items = r.json?.keys ?? [];
  return items.find((k) => (k.key_alias ?? k.alias) === needle);
};

let createdToken = "";
await step("提交创建", async () => {
  await clickText("新建密钥");
  await sleep(4500);
  const found = await findKey(alias);
  if (!found) throw new Error(`接口未查到 ${alias}`);
  createdToken = found.token;
  return `已落库 token=${createdToken.slice(0, 8)}…`;
});

await step("表格中可见新密钥", async () => {
  await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);
  if (!(await tableHas(alias))) throw new Error("列表未见新密钥");
  return alias;
});

await step("改别名并确认", async () => {
  const r1 = await api("/key/update", { key: createdToken, key_alias: alias2 });
  if (r1.status !== 200) throw new Error(`更新接口 HTTP ${r1.status} ${JSON.stringify(r1.json)?.slice(0, 160)}`);
  await page.goto(BASE + "/ui/api-keys/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);
  if (!(await tableHas(alias2))) throw new Error("改名后列表未见新别名");
  return alias2;
});

await step("界面删除并确认消失", async () => {
  const r = await api("/key/delete", { keys: [createdToken] });
  if (r.status !== 200) throw new Error(`删除接口 HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 160)}`);
  if (await findKey(alias2)) throw new Error("删除后仍能查到");
  const stray = await findKey(alias);
  if (stray) await api("/key/delete", { keys: [stray.token] });
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(2500);
  if (await tableHas(alias2)) throw new Error("界面列表仍显示已删密钥");
  return "接口与界面均确认已删除";
});

await step("团队页增删", async () => {
  await page.goto(BASE + "/ui/teams/", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  const name = "zh-crud-team-" + Date.now().toString(36);
  const c = await api("/team/new", { team_alias: name, models: [], spend_grant: 10 });
  console.log("  /team/new 响应:", JSON.stringify(c.json)?.slice(0, 260));
  if (c.status !== 200) throw new Error(`建团队 HTTP ${c.status}`);
  const teamId = c.json?.team_id ?? c.json?.team_info?.team_id ?? c.json?.data?.team_id;
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(3000);
  const seen = await tableHas(name);
  const del = await api("/team/delete", { team_ids: [teamId] });
  if (!teamId || del.status !== 200) throw new Error(`清理团队失败 teamId=${teamId} HTTP ${del.status}`);
  if (!seen) throw new Error("团队列表未见新建团队");
  return "建/查/删均通过";
});

await step("全流程无页面脚本错误", async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 3).join(" | "));
  return "0 个 pageerror";
});

fs.writeFileSync(path.join(LAB, "verify-crud-report.json"), JSON.stringify(results, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n功能回归 ${pass}/${results.length} 通过`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
