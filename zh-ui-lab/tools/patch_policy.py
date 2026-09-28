import io, json

SRC = r"D:\Qoder-Project\LiteLLM\litellm\policy_templates_backup.json"
MAP = r"D:\zh-ui-lab\policy-zh.json"
OUT = r"D:\zh-ui-lab\policy_templates_backup.json"

zh = json.load(io.open(MAP, encoding="utf-8"))
src = json.load(io.open(SRC, encoding="utf-8"))
used = set()


def walk(node):
    if isinstance(node, dict):
        return {k: walk(v) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(v) for v in node]
    if isinstance(node, str) and node in zh:
        used.add(node)
        return zh[node]
    return node


out = walk(src)
json.dump(out, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
leftover = set()


def scan(node):
    if isinstance(node, dict):
        for v in node.values():
            scan(v)
    elif isinstance(node, list):
        for v in node:
            scan(v)
    elif isinstance(node, str) and any(c.isupper() for c in node) and " " in node and not any("\u3000" <= c <= "\u9fff" for c in node):
        leftover.add(node)


scan(out)
print("已替换:", len(used), " 仍为英文的多词值:", len(leftover))
for x in sorted(leftover)[:25]:
    print("   -", x[:90])
