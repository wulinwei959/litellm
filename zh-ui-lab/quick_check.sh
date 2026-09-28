#!/usr/bin/env bash
# 快速回路：词典与注入 -> 类型门禁 -> 构建 -> 部署 -> 四套功能回归（跳过两个耗时的全站审计）
# 用于确认改动没有破坏功能；审计仍要定期用 round.sh / verify_all.sh 跑。
set -uo pipefail
export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
LAB=/d/zh-ui-lab

cd "$LAB" || exit 1
bash run.sh || { echo "!! 流水线失败"; exit 1; }

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
echo "== 全站页面与关键流程"
timeout 900 node verify.mjs 2>&1 | tail -2
echo "== 密钥与团队增删改"
timeout 900 node verify_crud.mjs 2>&1 | tail -1
echo "== 新建用户与界面开关"
timeout 900 node verify_more.mjs 2>&1 | tail -1
echo "== toast 提示消息"
timeout 900 node verify_toasts.mjs 2>&1 | tail -1
echo "== 快速回路结束"
