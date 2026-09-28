// toast 提示消息验证：只触发前端校验类提示（不写数据），断言提示文本已中文化。
// 交互审计看不到 toast，所以这一类文案需要单独的探针。
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:\\zh-ui-lab";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:4000";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const hasCjk = (s) => {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x3000 && c <= 0x9fff) return true;
  }
  return false;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000 });
await page.goto(BASE + "/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await new Promise((r) => setTimeout(r, 3000));

const readToasts = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-sonner-toast], .toaster [role="status"], .toaster [role="alert"]')]
      .map((n) => (n.innerText || "").trim().replace(/\s+/g, " ").slice(0, 120))
      .filter(Boolean));

const results = [];
const probe = async (name, route, action) => {
  await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2600));
  await action();
  await new Promise((r) => setTimeout(r, 1600));
  const toasts = await readToasts();
  const bad = toasts.filter((t) => /[A-Za-z]{3}/.test(t) && !hasCjk(t));
  results.push({ name, toasts, english: bad });
  console.log((bad.length ? "FAIL " : "PASS ") + name, JSON.stringify(toasts.slice(0, 3)));
  await page.keyboard.press("Escape");
};

// 空表单直接提交，触发前端必填校验提示
const submitEmpty = (trigger) => async () => {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.innerText || "").trim().includes(t));
    if (!btn) return false;
    btn.click();
    return true;
  }, trigger);
  if (!ok) console.log("  未找到触发按钮:", trigger);
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return;
    const b = [...dlg.querySelectorAll("button")].find((x) => /创建|保存|邀请|发送|提交/.test(x.innerText || ""));
    if (b) b.click();
  });
};

await probe("密钥弹窗空提交", "/ui/api-keys/", submitEmpty("新建密钥"));
await probe("用户弹窗空提交", "/ui/users/", submitEmpty("邀请用户"));
await probe("团队弹窗空提交", "/ui/teams/", submitEmpty("新建团队"));

fs.writeFileSync(path.join(LAB, "verify-toast-report.json"), JSON.stringify(results, null, 1));
const badAll = results.flatMap((r) => r.english);
console.log(`\ntoast 探针 ${results.filter((r) => !r.english.length).length}/${results.length} 干净，英文 toast ${badAll.length} 条`);
await browser.close();
