#!/usr/bin/env bash
# 中文面板流水线：合并词典 -> 从仓库重置纯净源码 -> 单进程批量替换 -> 输出未覆盖清单
set -euo pipefail
LAB=/d/zh-ui-lab
REPO=/d/Qoder-Project/LiteLLM/ui/litellm-dashboard

python - <<'PY'
import glob, io, json, os
merged = {}
for f in sorted(glob.glob(r"D:\zh-ui-lab\dicts\*.json") + glob.glob(r"D:\zh-ui-lab\*zh.json")):
    base = os.path.basename(f)
    if base.startswith(("all-zh", "api-zh", "slug-zh", "dynamic-zh")):
        continue  # slug/api/dynamic 三张表由注入器单独消费，混进 UI 词典会误伤
    merged.update(json.load(io.open(f, encoding="utf-8")))
json.dump(merged, io.open(r"D:\zh-ui-lab\all-zh.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("词典条目:", len(merged))
PY

rm -rf "$LAB/dash/src"
cp -r "$REPO/src" "$LAB/dash/src"

# 站点注入跑在 AST 替换之前：替换锚点取自上游纯净源码，不受词典影响
python "$LAB/tools/inject_sites.py" || { echo "!! 站点注入失败（上游源码可能已漂移）"; exit 1; }

node "$LAB/tools/zh-inject.mjs" apply "$LAB/dash/src" "$LAB/all-zh.json"

python "$LAB/tools/inject_api.py" || { echo "!! 接口文案注入失败"; exit 1; }

# 类型门禁：变换可能把判别联合字面量（scope: "Team"）当文案换掉，先 tsc 再进完整构建。
# next build 不检查测试文件，这里同样过滤掉 .test.，否则会被既有噪声淹没。
if [ "${SKIP_TSC:-0}" != "1" ]; then
  errs=$( (cd "$LAB/dash" && npx --no-install tsc --noEmit -p tsconfig.json 2>&1) | grep -vE "\.test\.tsx?\(|\.test\.ts\(|node_modules" | grep -E "error TS" || true)
  if [ -n "$errs" ]; then
    echo "!! 类型门禁失败（非测试文件）"; echo "$errs" | head -15; exit 1
  fi
  echo "类型门禁通过"
fi
