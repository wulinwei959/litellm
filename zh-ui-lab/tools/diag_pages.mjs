// 诊断：登录后进密钥页与团队页，打印可见按钮全集、页面文本前若干行与所有报错
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const LAB = "D:/zh-ui-lab";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const key = /LITELLM_MASTER_KEY:\s*(\S+)/.exec(fs.readFileSync(path.join(LAB, "overlay-ui.yml"), "utf8"))[1];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000 });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 180)));
page.on("console", (m) => {
  if (m.type() === "error") errs.push("console: " + m.text().slice(0, 180));
});

await page.goto("http://localhost:4000/ui/login/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[name="username"]', { timeout: 20000 });
await page.type('input[name="username"]', "admin");
await page.type('input[name="password"]', key);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await new Promise((r) => setTimeout(r, 3000));

for (const route of ["/ui/api-keys/", "/ui/teams/"]) {
  await page.goto("http://localhost:4000" + route, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));
  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim());
    return {
      count: btns.length,
      keys: btns.filter((t) => t.includes("密钥")),
      teams: btns.filter((t) => t.includes("团队")),
      rows: document.querySelectorAll("tbody tr").length,
      body: document.body.innerText.slice(0, 300).replace(/\n/g, " / "),
    };
  });
  console.log("###", route);
  console.log("  按钮总数", info.count, "含密钥:", JSON.stringify(info.keys), "含团队:", JSON.stringify(info.teams));
  console.log("  表格行数", info.rows);
  console.log("  文本头", info.body);
}
console.log("报错:", JSON.stringify(errs.slice(0, 8), null, 1));
await browser.close();
