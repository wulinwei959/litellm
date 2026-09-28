#!/usr/bin/env python3
"""把交互审计残留回查到原文出处：后端走 ast 解析，前端走 zh-inject 的候选清单。

审计输出按长度截断过，不能直接当词典键，所以拿前 70 字做唯一前缀匹配，命中的完整
原文才是键。后端说明文本既有跨行隐式拼接又有拿 docstring 当 description 的写法，
用正则拼不回来，直接 ast 解析取常量值。
"""
import ast
import io
import json
import os
import sys

LAB = r"D:\zh-ui-lab"
BACK_ROOTS = [r"D:\Qoder-Project\LiteLLM\litellm", r"D:\Qoder-Project\LiteLLM\enterprise"]
SKIP_DIRS = {"node_modules", "__pycache__"}
BRANDS = [
    "MCP", "Claude", "Slack", "slack", "GitHub", "Notion", "Linear", "Atlassian", "Google",
    "Jira", "Amazon", "Bedrock", "Azure", "GitLab", "Discord", "Twilio", "PostgreSQL",
    "Redis", "Valkey", "Snowflake", "Supabase", "Obsidian", "Brave", "Exa", "Tavily",
    "Browserbase", "AWS", "Cloudflare", "Filesystem", "Docker", "Stripe", "Shopify",
    "LiteLLM", "SCIM", "Hashicorp", "CyberArk", "LlamaIndex", "Langchain", "OpenAI",
    "A2A", "litellm", "E2B", "Daytona", "DeepWiki", "Playwright", "Puppeteer",
    "DigitalOcean", "Context7", "Sentry", "MongoDB", "MySQL", "SQLite",
]
SKIP_EXACT = {
    "ID", "LLM", "TPM", "RPM", "None", "Admin", "Organization", "Host", "OR", "Use",
    "Files", "required", "Deployments", "API Key", "Close toast",
}
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
OPENERS = ("'", '"', "{", "[", "#", "`")


def backend_literals():
    out = set()
    for root in BACK_ROOTS:
      for dirpath, dirnames, names in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for n in names:
            if not n.endswith(".py"):
                continue
            src = io.open(os.path.join(dirpath, n), encoding="utf-8", errors="ignore").read()
            try:
                tree = ast.parse(src)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    v = node.value
                    if 6 <= len(v) <= 600 and "\n" not in v:
                        out.add(v)
    return out


def main():
    backend = backend_literals()
    unc = json.load(io.open(LAB + r"\dash\uncovered-files.json", encoding="utf-8"))
    frontend = {e["text"]: e["files"] for e in unc}
    print("后端字面量:", len(backend), " 前端候选:", len(frontend))

    known = set()
    for name in ("api-zh.json", "api-zh11.json", "all-zh.json"):
        try:
            known |= set(json.load(io.open(os.path.join(LAB, name), encoding="utf-8")))
        except OSError:
            pass

    report = sys.argv[1] if len(sys.argv) > 1 else LAB + chr(92) + "interaction-report.json"
    out = sys.argv[2] if len(sys.argv) > 2 else LAB + chr(92) + "todo12.json"
    items = json.load(io.open(report, encoding="utf-8"))["items"]
    todo, unmatched = {}, []
    for it in items:
        raw = it["text"]
        attr = raw.startswith("@")
        for pre in ("@aria-label:", "@title:", "@placeholder:", "@alt:"):
            if raw.startswith(pre):
                raw = raw[len(pre):]
                break
        if any(b in raw for b in BRANDS) or raw in SKIP_EXACT or raw[:1] in OPENERS:
            continue
        if raw.startswith(MONTHS):
            continue
        key = raw[:70]
        b = sorted({t for t in backend if t.startswith(key)})
        f = sorted(t for t in frontend if t.startswith(key))
        if len(b) == 1 and b[0] not in known:
            todo[b[0]] = "api"
        elif len(f) == 1 and f[0] not in known:
            todo[f[0]] = "ui:" + frontend[f[0]][0]
        else:
            unmatched.append((raw, len(b), len(f), attr))

    json.dump(todo, io.open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已定位:", len(todo), " api:", sum(1 for v in todo.values() if v == "api"),
          " ui:", sum(1 for v in todo.values() if v.startswith("ui:")))
    print("仍未定位:", len(unmatched))
    for raw, nb, nf, attr in unmatched:
        print("  ?", ("[attr] " if attr else "") + raw[:80], " b=%d f=%d" % (nb, nf))
    return 0


if __name__ == "__main__":
    sys.exit(main())
