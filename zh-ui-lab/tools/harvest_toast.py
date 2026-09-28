#!/usr/bin/env python3
# 抽出全站 toast.*("...") 的字面量提示消息，供批量翻译。
import io
import json
import os
import re

SRC = r"D:\Qoder-Project\LiteLLM\ui\litellm-dashboard\src"
RE = re.compile(r"toast\.(success|error|info|warning|message|loading)\(\s*([\"'])((?:[^\"\\]|\\.)+?)\2")

found = set()
for dirpath, dirnames, names in os.walk(SRC):
    dirnames[:] = [d for d in dirnames if d != "node_modules" and not d.startswith(".")]
    for n in names:
        if not n.endswith((".tsx", ".ts")) or ".test." in n:
            continue
        src = io.open(os.path.join(dirpath, n), encoding="utf-8", errors="ignore").read()
        for m in RE.finditer(src):
            body = m.group(3)
            if "${" in body or "\\n" in body or len(body) < 4 or len(body) > 300:
                continue
            found.add(body.replace('\\"', '"').replace("\\'", "'"))

known = set()
for f in ("all-zh.json", "api-zh.json"):
    try:
        known |= set(json.load(io.open(os.path.join(r"D:\zh-ui-lab", f), encoding="utf-8")))
    except OSError:
        pass
todo = sorted(found - known)
json.dump(todo, io.open(r"D:\zh-ui-lab\toast-en.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("toast 字面量:", len(found), " 未收录:", len(todo))
for i, t in enumerate(todo[:60]):
    print(i, "|", t[:96])
