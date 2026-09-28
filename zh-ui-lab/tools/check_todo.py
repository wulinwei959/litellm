import json
import os
import re
import sys

DICT_SKIP = ("all-zh", "api-zh", "slug-zh", "dynamic-zh")


def load_keys():
    keys = set()
    for name in os.listdir("."):
        if not name.endswith(".json"):
            continue
        base = name[:-5]
        if base.startswith(DICT_SKIP):
            continue
        try:
            data = json.load(open(name, encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, dict):
            keys.update(data.keys())
    return keys


def norm(text):
    text = re.sub(r"^@(placeholder|aria-label|alt|title|tooltip):", "", text)
    return re.sub(r"\s+", " ", text).strip()


def main():
    report = json.load(open(sys.argv[1], encoding="utf-8"))
    items = report.get("items", report)
    keys = load_keys()
    # 合并词典里英文原文做键的，也包含 zh-inject 用的 all-zh.json
    for extra in ("all-zh.json",):
        if os.path.exists(extra):
            keys.update(json.load(open(extra, encoding="utf-8")).keys())
    missing = []
    for it in items:
        text = it if isinstance(it, str) else it.get("text", "")
        k = norm(text)
        if not k:
            continue
        if k in keys:
            continue
        missing.append(k)
    print(json.dumps({"total": len(items), "missing": len(missing)}, ensure_ascii=False))
    for k in missing:
        print("  " + k[:120])


main()
