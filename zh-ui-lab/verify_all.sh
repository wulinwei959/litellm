#!/usr/bin/env bash
# 完整验收链：词典与注入 -> 类型门禁 -> 构建 -> 部署 -> 页面审计 -> 交互审计 -> 三套功能回归 -> 截图
set -uo pipefail
export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
LAB=/d/zh-ui-lab

cd "$LAB" || exit 1
bash run.sh || { echo "!! 流水线失败（多为类型门禁）"; exit 1; }

cd "$LAB/dash" || exit 1
NEXT_TELEMETRY_DISABLED=1 timeout 1200 npm run build > /tmp/round-build.log 2>&1 || {
  echo "!! 构建失败"; grep -E "Type error|error TS|Failed" /tmp/round-build.log | head -8; exit 1;
}

rm -rf "$LAB/ui-mount"/*
cp -r "$LAB/dash/out/." "$LAB/ui-mount/"
cd /d/Qoder-Project/LiteLLM/docker || exit 1
docker compose -f docker-compose.quickstart.yml -f "$LAB/overlay-ui.yml" up -d --force-recreate litellm >/dev/null 2>&1
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w %{http_code} http://localhost:4000/health/liveliness)" = "200" ] && break
  sleep 4
done
echo "== 部署完成 liveliness=$(curl -s -o /dev/null -w %{http_code} http://localhost:4000/health/liveliness)"

cd "$LAB/tools" || exit 1
echo "== 页面层审计"
timeout 1500 node audit.mjs 2>&1 | grep -E "页面数:|去重英文串" | head -3
echo "== 交互层审计"
timeout 2400 node audit_interactions.mjs 2>&1 | grep -E "交互层累计" | head -2
echo "== 功能回归：全站页面与关键流程"
timeout 900 node verify.mjs 2>&1 | tail -3
echo "== 功能回归：密钥与团队增删改"
timeout 900 node verify_crud.mjs 2>&1 | tail -2
echo "== 功能回归：新建用户与界面开关"
timeout 900 node verify_more.mjs 2>&1 | tail -3
echo "== 功能回归：toast 提示消息中文化"
timeout 900 node verify_toasts.mjs 2>&1 | tail -2
echo "== 功能回归：tooltip 悬停探针"
timeout 1800 node verify_tooltips.mjs 2>&1 | tail -12
echo "== 功能回归：添加模型/日志详情/用量切换/护栏详情"
timeout 900 node verify_flows2.mjs 2>&1 | tail -2
echo "== 功能回归：导航/排序/主题/登录态"
timeout 900 node verify_flows3.mjs 2>&1 | tail -3
echo "== 截图留证"
timeout 900 node shots.mjs 2>&1 | tail -2
echo "== 全部验收步骤结束"
