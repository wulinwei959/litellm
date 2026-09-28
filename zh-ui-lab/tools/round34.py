import json

LAB = "D:/zh-ui-lab"

with open(LAB + "/dynamic-zh.json", encoding="utf-8") as f:
    dyn = json.load(f)

added = []
if "Not Set" not in dyn["text"]:
    dyn["text"]["Not Set"] = "未设置"
    added.append("Not Set")
for k, v in (("CSV", "CSV"), ("XLSX", "XLSX")):
    pass

with open(LAB + "/dynamic-zh.json", "w", encoding="utf-8") as f:
    json.dump(dyn, f, ensure_ascii=False, indent=1)
    f.write("\n")

with open(LAB + "/round34-zh.json", "w", encoding="utf-8") as f:
    json.dump(
        {
            "Export {0}": "导出 {0}",
            "Export {0} Usage": "导出 {0} 用量",
            "Exporting...": "正在导出…",
            "Select Organization": "选择组织",
        },
        f,
        ensure_ascii=False,
        indent=1,
    )
    f.write("\n")

print("dynamic-zh 追加:", added, "| round34 已写")
