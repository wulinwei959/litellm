#!/usr/bin/env python3
# 第 14 批接口词条：审计残留里确认为后端下发的标签与说明。
# 键一律用 ast 扫后端得到的完整原文，避免拿截断文本当键。
import ast
import io
import json
import os
import sys

BACK_SRC = r"D:\Qoder-Project\LiteLLM\litellm"

PAIRS = [
    ("[BETA] Enable Projects", "【测试版】启用项目（页面会刷新）"),
    ("[BETA] Enable Chat page", "【测试版】启用对话页（页面会刷新）"),
    ("Connection test failed", "连接测试失败：缓存连接测试失败：redis 必须指定 host 或 url。"),
    ("Models outside non-priority groups", "不属于非优先级分组的模型，使用网关的顶层路由策略。"),
    ("Upstream API Base", "上游接口基础地址"),
]


def backend_literals():
    out = set()
    for dirpath, dirnames, names in os.walk(BACK_SRC):
        dirnames[:] = [d for d in dirnames if d != "__pycache__" and not d.startswith(".")]
        for n in names:
            if not n.endswith(".py"):
                continue
            try:
                tree = ast.parse(io.open(os.path.join(dirpath, n), encoding="utf-8", errors="ignore").read())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if 3 <= len(node.value) <= 600 and "\n" not in node.value:
                        out.add(node.value)
    return out


def main():
    lits = backend_literals()
    out, miss = {}, []
    for prefix, zh in PAIRS:
        hits = sorted(t for t in lits if t.startswith(prefix))
        if len(hits) == 1:
            out[hits[0]] = zh
        else:
            miss.append((prefix, len(hits)))
    # 单字标签只在展示型父键下才生效，交给 zhNode 的 RISKY_WORDS 闸门把关
    for word, zh in (("API Key", "API 密钥"), ("Host", "主机"), ("Organization", "组织"), ("Deployments", "部署")):
        if word in lits:
            out[word] = zh
    if miss:
        print("未唯一命中:", miss)
    json.dump(out, io.open(r"D:\zh-ui-lab\api-zh14.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("落接口词典:", len(out))
    for k in out:
        print("  ", repr(k[:64]), "->", out[k][:18])
    return 0


if __name__ == "__main__":
    sys.exit(main())
