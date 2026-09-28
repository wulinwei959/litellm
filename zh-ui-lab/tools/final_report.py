#!/usr/bin/env python3
"""生成汉化验收报告：把审计残留逐条归入"保留英文的理由"，并汇总各套功能回归结果。

判据不是"有没有英文"，而是"这段英文是不是用户可见的产品文案"。
品牌名、协议/代码标识、示例代码、数据值属于"译了会失指代或破功能"，单列并给理由。
"""
import glob
import io
import json
import os
import re
import subprocess
import sys

LAB = r"D:\zh-ui-lab"
REPO = r"D:\Qoder-Project\LiteLLM"

BRAND = re.compile(
    r"MCP|Claude|Slack|GitHub|Notion|Linear|Atlassian|Google|Jira|Amazon|Bedrock|Azure|GitLab|"
    r"Discord|Twilio|PostgreSQL|Redis|Valkey|Snowflake|Supabase|Obsidian|Brave|Exa|Tavily|"
    r"Browserbase|AWS|Cloudflare|Docker|Stripe|Shopify|LiteLLM|SCIM|Hashicorp|CyberArk|LlamaIndex|"
    r"Langchain|OpenAI|A2A|E2B|Daytona|DeepWiki|Playwright|Puppeteer|DigitalOcean|Context7|Sentry|"
    r"MongoDB|MySQL|SQLite|OpenAPI|Prometheus|Agent365|Presidio|Straiker|Zapier|IATA|CloudZero|"
    r"Teams|Gemini|Anthropic|Vertex|Serper|Perplexity|Figma|Kafka",
    re.I,
)
IDENT = re.compile(
    r"^(ID|TPM|RPM|LLM|OR|None|UTC|JSON|YAML|API Key|Cache|Timezone|Host|SSO|Token|URL|IP|Filesystem)$"
    r"|^[A-Z][A-Za-z]+Error（\d{3}）$"
    r"|^[a-z_]+(-[a-z0-9]+)+$"
)
CODEISH = re.compile(r'^["\'{\[#]|\\n|\{\{|\$\{|^\s*$|^\(|\bmcpServers\b|forward_api_key|"tags"|"region"|"description"')
URLISH = re.compile(r"https?://|example\.com|@placeholder:")
DATA = re.compile(r"^sk-[A-Za-z0-9.*_-]{3,}$|^[0-9a-f]{8}-[0-9a-f]{4}-|^\d{1,3}(\.\d{1,3}){3}$")


def bucket(text):
    t = text.split(":", 1)[1] if text.startswith("@") else text
    if URLISH.search(t):
        return "示例地址/占位符", "用户要替换成自己的值，译了反而误导"
    if CODEISH.search(t):
        return "示例代码", "可复制执行的代码，必须保持原样"
    if BRAND.search(t):
        return "品牌与产品名", "官方名称，无通用中文译名"
    if IDENT.match(t.strip()):
        return "协议或代码标识", "是枚举值/异常类名/标准缩写，译了会破功能或失指代"
    if DATA.match(t.strip()):
        return "数据值", "来自数据库或运行时数据，不是界面文案"
    return "待办", ""


def load(name):
    p = os.path.join(LAB, name)
    if not os.path.exists(p):
        return None
    return json.load(io.open(p, encoding="utf-8"))


def main():
    lines = ["# 中文面板验收报告", ""]

    dict_total = 0
    for f in sorted(glob.glob(os.path.join(LAB, "*-zh.json"))):
        n = len(json.load(io.open(f, encoding="utf-8")))
        dict_total += n
        lines.append(f"- 词典 `{os.path.basename(f)}`: {n} 条")
    lines.append(f"- 合并后 UI 词典: {len(load('all-zh.json'))} 条")
    lines.append("")

    page = load("audit-report.json")
    if page:
        items = sorted({e for v in page.values() for e in v.get("english", [])})
        lines.append(f"## 页面层：{len(page)} 个页面，去重英文 {len(items)} 条")
        groups = {}
        for t in items:
            groups.setdefault(bucket(t)[0], []).append(t)
        for g, ts in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"- **{g}**（{len(ts)}）: {', '.join(ts[:8])}")
        lines.append("")

    inter = load("interaction-report.json")
    if inter:
        items = [x["text"] for x in inter["items"]]
        lines.append(f"## 交互层（点开弹窗/内联面板/标签页后）：去重英文 {len(items)} 条")
        groups = {}
        for t in items:
            g, why = bucket(t)
            groups.setdefault(g, []).append((t, why))
        for g, ts in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"- **{g}**（{len(ts)}）")
            for t, why in ts[:10]:
                lines.append(f"  - {t[:70]!r} — {why}")
        lines.append("")

    lines.append("## 功能回归")
    pages = load("verify-report.json")
    if isinstance(pages, dict):
        pr = pages.get("results", [])
        fl = pages.get("flows", [])
        lines.append(
            f"- 全站页面与关键流程: {sum(1 for r in pr if r.get('ok'))}/{len(pr)} 页面，"
            f"{sum(1 for r in fl if r.get('ok'))}/{len(fl)} 流程"
        )
        for r in fl:
            if not r.get("ok"):
                lines.append(f"  - FAIL 流程 {r.get('name')}: {str(r.get('detail', ''))[:110]}")
    tips = load("verify-tooltip-report.json")
    if isinstance(tips, list):
        lines.append(f"- tooltip 悬停探针: 弹出提示中仍为英文 {len(tips)} 条（详见交互审计口径，数据值不计）")
    for name, fn in (
        ("密钥与团队增删改", "verify-crud-report.json"),
        ("新建用户与界面开关", "verify-more-report.json"),
        ("toast 提示消息", "verify-toast-report.json"),
        ("添加模型标签页/日志详情/用量切换/护栏详情", "verify-flows2-report.json"),
        ("导航/排序/弹窗/主题/登录态", "verify-flows3-report.json"),
    ):
        rep = load(fn)
        if rep is None:
            continue
        if isinstance(rep, list) and rep and "english" in rep[0]:
            bad = sum(len(r.get("english", [])) for r in rep)
            lines.append(f"- {name}: {len(rep) - sum(1 for r in rep if r['english'])}/{len(rep)} 干净，英文 toast {bad} 条")
        elif isinstance(rep, list):
            ok = sum(1 for r in rep if r.get("ok"))
            lines.append(f"- {name}: {ok}/{len(rep)} 通过")
            for r in rep:
                if not r.get("ok"):
                    lines.append(f"  - FAIL {r['name']}: {r.get('detail', '')[:110]}")
    lines.append("")

    git = subprocess.run(
        ["git", "-C", REPO, "status", "--porcelain"], capture_output=True, text=True
    ).stdout.strip()
    branch = subprocess.run(
        ["git", "-C", REPO, "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True
    ).stdout.strip()
    lines.append(f"## 仓库状态\n- 分支 {branch}，工作树改动 {len(git.splitlines())} 条")

    out = os.path.join(LAB, "FINAL-REPORT.md")
    io.open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
