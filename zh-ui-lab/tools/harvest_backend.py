#!/usr/bin/env python3
"""从后端源码抽取会下发到界面的说明文本，供批量翻译。

只抽 Field(description=...) / title=... 与少数已知枚举显示名，按文件归类打印，
人工过一遍后落进 api-zh12.json。抽取范围刻意限定在设置类接口背后的模型定义。
"""
import io
import json
import re
import sys

REPO = r"D:\Qoder-Project\LiteLLM"
FILES = [
    r"litellm\proxy\ui_crud_endpoints\proxy_setting_endpoints.py",
    r"litellm\proxy\_types.py",
    r"litellm\proxy\guardrails\guardrail_hooks\archift\__init__.py",
]
PAT = re.compile(r'(?:description|title)\s*=\s*"((?:[^"\\]|\\.){6,})"')


def main():
    out = []
    for rel in FILES:
        try:
            src = io.open(REPO + "\\" + rel, encoding="utf-8").read()
        except OSError:
            continue
        for m in PAT.finditer(src):
            text = m.group(1).replace('\\"', '"').replace("\\\\", "\\")
            out.append(text)
    uniq = sorted(set(out))
    print("抽到:", len(uniq))
    json.dump(uniq, io.open(r"D:\zh-ui-lab\backend-desc.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    known = set()
    for f in ("api-zh.json", "api-zh11.json"):
        try:
            known |= set(json.load(io.open(r"D:\zh-ui-lab\\" + f, encoding="utf-8")))
        except OSError:
            pass
    todo = [t for t in uniq if t not in known]
    print("未收录:", len(todo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
