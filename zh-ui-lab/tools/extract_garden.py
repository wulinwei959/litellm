import io, json, os, re

files = [
    r"D:\zh-ui-lab\dash\src\app\(dashboard)\guardrails\_components\guardrail_garden_data.ts",
    r"D:\zh-ui-lab\dash\src\app\(dashboard)\guardrails\_components\guardrail_garden_configs.ts",
]
pat = re.compile(r'(name|description|title|categoryLabel|tagline):\s*"((?:[^"\\]|\\.)*)"')
cjk = re.compile(r"[　-鿿]")
alpha = re.compile(r"[A-Za-z]{3}")
out = set()
for f in files:
    if not os.path.exists(f):
        print("missing", f)
        continue
    s = io.open(f, encoding="utf-8").read()
    for m in pat.finditer(s):
        v = m.group(2)
        if alpha.search(v) and not cjk.search(v):
            out.add(v)
items = sorted(out)
io.open(r"D:\zh-ui-lab\garden-strings.json", "w", encoding="utf-8").write(
    json.dumps(items, ensure_ascii=False, indent=1)
)
print("唯一英文串:", len(items))
for v in items:
    print(len(v), "|", v)
