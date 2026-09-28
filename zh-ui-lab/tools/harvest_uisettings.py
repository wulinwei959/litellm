#!/usr/bin/env python3
# 从 /get/ui_settings 实际响应里取未收录的说明文本，按索引配译文。
import io
import json

LAB = r"D:/zh-ui-lab/"

ZH = [
    "向下游 LLM 转发客户端请求头（Authorization、anthropic-beta 以及 x-* 自定义头）。"
    "使用 Max 订阅的 Claude Code 需要开启（用于转发 OAuth 令牌），或需要把自定义/链路追踪头透传给服务商时开启。"
    "与自带密钥开关相互独立，只开你需要的那几个。",
    "启用后，组织管理员不能通过 /key/generate 生成 API 密钥。",
    "启用后，未鉴权的 /health/readiness 接口会返回旧版详细负载。",
    "启用后，界面侧栏会出现“对话”页，用户可与 LLM 对话并通过 OAuth 接入自己的 MCP 服务器凭证。",
    "禁止团队管理员从其管理的团队中删除用户。适用于成员关系由外部系统（如 SCIM）定义的场景。",
]

d = json.load(io.open(LAB + "uisettings.json", encoding="utf-8"))
found = set()


def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, str) and len(v) > 3 and k in ("description", "title", "label"):
                found.add(v)
            else:
                walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)


walk(d)
known = set()
for f in ("api-zh.json", "api-zh11.json", "api-zh12.json", "all-zh.json"):
    try:
        known |= set(json.load(io.open(LAB + f, encoding="utf-8")))
    except OSError:
        pass
todo = sorted(t for t in found if t not in known)
assert len(todo) == len(ZH), (len(todo), len(ZH))
out = {t: z for t, z in zip(todo, ZH)}
json.dump(out, io.open(LAB + "api-zh13.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("落接口词典:", len(out))
for k in todo[:2]:
    print("  ", repr(k[:46]), "->", out[k][:16])
