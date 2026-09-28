#!/usr/bin/env python3
"""用 ast 取到的后端原文纠正被截断的接口词典键，并输出本轮新定位的条目骨架。

审计输出会按长度截断，直接拿它当键只会命中"前缀"，zhNode 是精确匹配，前缀键永远不生效。
"""
import ast
import io
import json
import os
import sys

LAB = r"D:\zh-ui-lab"
BACK_SRC = r"D:\Qoder-Project\LiteLLM\litellm"


def backend_literals():
    out = set()
    for dirpath, dirnames, names in os.walk(BACK_SRC):
        dirnames[:] = [d for d in dirnames if d not in ("__pycache__",) and not d.startswith(".")]
        for n in names:
            if not n.endswith(".py"):
                continue
            try:
                tree = ast.parse(io.open(os.path.join(dirpath, n), encoding="utf-8", errors="ignore").read())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if 6 <= len(node.value) <= 600 and "\n" not in node.value:
                        out.add(node.value)
    return out


def canon(d, backend, apply):
    """只对有把握的整句键做纠正。

    短词键（Admin、Vision）是前端渲染态而非后端原文，换成"更长句子的开头"就错了。
    """
    fixed, dropped = {}, []
    for k, v in d.items():
        if len(k) > 40 and " " in k:
            hits = sorted({t for t in backend if t.startswith(k)})
            if len(hits) == 1:
                if hits[0] != k:
                    print(("  纠正 " if apply else "  可纠正 ") + repr(k[:50]) + " -> " + repr(hits[0][:60]))
                if apply:
                    fixed[hits[0]] = v
                    continue
            elif len(hits) > 1:
                dropped.append((k, len(hits)))
        fixed[k] = v
    return fixed, dropped


def main():
    backend = backend_literals()
    for name in ("api-zh.json", "api-zh11.json"):
        path = os.path.join(LAB, name)
        if not os.path.exists(path):
            continue
        d = json.load(io.open(path, encoding="utf-8"))
        apply = name == "api-zh11.json"
        fixed, dropped = canon(d, backend, apply)
        if apply:
            json.dump(fixed, io.open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(name, "原有:", len(d), " 结果:", len(fixed), " 歧义:", len(dropped))
        for k, n in dropped:
            print("  歧义:", k[:60], n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
