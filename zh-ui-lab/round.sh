#!/usr/bin/env bash
# 一轮完整迭代：应用词典 -> 类型门禁 -> 构建 -> 部署 -> 整站审计
set -uo pipefail
export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
LAB=/d/zh-ui-lab

cd "$LAB" || exit 1
bash run.sh || { echo "!! 流水线失败（多为类型门禁）"; exit 1; }

cd "$LAB/dash" || exit 1
NEXT_TELEMETRY_DISABLED=1 timeout 1200 npm run build > /tmp/round-build.log 2>&1
if [ $? -ne 0 ]; then
  echo "!! 构建失败"; grep -E "Type error|error TS|Failed" /tmp/round-build.log | head -8; exit 1
fi

rm -rf "$LAB/ui-mount"/*; cp -r "$LAB/dash/out/." "$LAB/ui-mount/"
cd /d/Qoder-Project/LiteLLM/docker || exit 1
docker compose -f docker-compose.quickstart.yml -f "$LAB/overlay-ui.yml" up -d --force-recreate litellm >/dev/null 2>&1
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w %{http_code} http://localhost:4000/health/liveliness)" = "200" ] && break
  sleep 4
done
echo "部署完成 liveliness=$(curl -s -o /dev/null -w %{http_code} http://localhost:4000/health/liveliness)"

cd "$LAB/tools" || exit 1
timeout 1500 node audit.mjs 2>&1 | tail -45
