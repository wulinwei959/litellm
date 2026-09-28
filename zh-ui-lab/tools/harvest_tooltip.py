#!/usr/bin/env python3
# 抽出 <TooltipContent> 里的可见文案。审计不会悬停，这类文本只能静态收割。
import io
import json
import os
import re

SRC = r"D:\Qoder-Project\LiteLLM\ui\litellm-dashboard\src"
RE = re.compile(r"<TooltipContent[^>]*>(.{3,240}?)</TooltipContent>", re.S)

found = set()
for dirpath, dirnames, names in os.walk(SRC):
    dirnames[:] = [d for d in dirnames if d != "node_modules" and not d.startswith(".")]
    for n in names:
        if not n.endswith(".tsx") or ".test." in n:
            continue
        src = io.open(os.path.join(dirpath, n), encoding="utf-8", errors="ignore").read()
        for m in RE.finditer(src):
            body = m.group(1)
            if "<" in body or "{" in body or "&" in body:
                continue
            text = " ".join(body.split())
            if 3 <= len(text) <= 200 and re.search(r"[A-Za-z]{3}", text):
                found.add(text)

known = set(json.load(io.open(r"D:\zh-ui-lab\all-zh.json", encoding="utf-8")))
todo = sorted(found - known)
json.dump(todo, io.open(r"D:\zh-ui-lab\tooltip-en.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("tooltip 文案:", len(found), " 未收录:", len(todo))
for i, t in enumerate(todo[:70]):
    print(i, "|", t[:96])
