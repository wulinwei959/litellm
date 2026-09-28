#!/usr/bin/env python3
# 一次性脚本：把重试策略异常名等动态展示文案并入 dynamic-zh.json
import io
import json

P = r"D:\zh-ui-lab\dynamic-zh.json"
ADDED = {
    "BadRequestError (400)": "BadRequestError（400）",
    "AuthenticationError  (401)": "AuthenticationError（401）",
    "TimeoutError (408)": "TimeoutError（408）",
    "RateLimitError (429)": "RateLimitError（429）",
    "ContentPolicyViolationError (400)": "ContentPolicyViolationError（400）",
    "InternalServerError (500)": "InternalServerError（500）",
    "ServiceUnavailableError (503)": "ServiceUnavailableError（503）",
    "NotFoundError (404)": "NotFoundError（404）",
    "All other errors": "其他所有错误",
    "Upstream API Base": "上游接口基础地址",
}

d = json.load(io.open(P, encoding="utf-8"))
d["text"].update(ADDED)
json.dump(d, io.open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("dynamic text 条目:", len(d["text"]))
