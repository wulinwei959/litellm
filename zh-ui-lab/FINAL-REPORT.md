# 中文面板验收报告

- 词典 `all-zh.json`: 3368 条
- 词典 `api-zh.json`: 86 条
- 词典 `audit1-zh.json`: 93 条
- 词典 `audit2-zh.json`: 109 条
- 词典 `audit3-zh.json`: 238 条
- 词典 `audit4-zh.json`: 209 条
- 词典 `audit5-zh.json`: 39 条
- 词典 `audit6-zh.json`: 75 条
- 词典 `audit7-zh.json`: 19 条
- 词典 `audit8-zh.json`: 7 条
- 词典 `audit9-zh.json`: 48 条
- 词典 `core-zh.json`: 221 条
- 词典 `core2-zh.json`: 247 条
- 词典 `core3-zh.json`: 710 条
- 词典 `dialogs-zh.json`: 130 条
- 词典 `dynamic-zh.json`: 2 条
- 词典 `garden-zh.json`: 107 条
- 词典 `login-zh.json`: 13 条
- 词典 `policy-zh.json`: 77 条
- 词典 `round10-zh.json`: 7 条
- 词典 `round11-zh.json`: 185 条
- 词典 `round12-zh.json`: 8 条
- 词典 `round13-zh.json`: 93 条
- 词典 `round14-zh.json`: 124 条
- 词典 `round15-zh.json`: 2 条
- 词典 `round16-zh.json`: 41 条
- 词典 `round17-zh.json`: 67 条
- 词典 `round18-zh.json`: 80 条
- 词典 `round19-zh.json`: 59 条
- 词典 `round21-zh.json`: 82 条
- 词典 `round22-zh.json`: 50 条
- 词典 `round23-zh.json`: 4 条
- 词典 `round24-zh.json`: 5 条
- 词典 `round25-zh.json`: 51 条
- 词典 `round25b-zh.json`: 107 条
- 词典 `round26-zh.json`: 54 条
- 词典 `round27-zh.json`: 235 条
- 词典 `round28-zh.json`: 2 条
- 词典 `round29-zh.json`: 34 条
- 词典 `round30-zh.json`: 21 条
- 词典 `round31-zh.json`: 29 条
- 词典 `round32-zh.json`: 12 条
- 词典 `round33-zh.json`: 10 条
- 词典 `round34-zh.json`: 4 条
- 词典 `shell-zh.json`: 121 条
- 词典 `slug-zh.json`: 52 条
- 合并后 UI 词典: 3368 条

## 页面层：48 个页面，去重英文 23 条
- **品牌与产品名**（12）: @alt:LiteLLM, @alt:openai logo, @title:openai/gpt-4o, Amazon Bedrock, CyberArk Conjur, Hashicorp Vault, Langchain Py, LlamaIndex
- **示例地址/占位符**（5）: @placeholder:https://example.com, @placeholder:https://example.com/favicon.ico, @placeholder:https://example.com/logo-dark.png, @placeholder:https://example.com/logo.png, http://localhost:4000/ui/model_hub_table
- **协议或代码标识**（4）: @title:gpt-4o, financial-pii, gpt-4o, simple-shuffle
- **数据值**（1）: sk-...LBAw
- **示例代码**（1）: {
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistan

## 交互层（点开弹窗/内联面板/标签页后）：去重英文 71 条
- **品牌与产品名**（40）
  - 'LiteLLM' — 官方名称，无通用中文译名
  - 'SCIM' — 官方名称，无通用中文译名
  - 'Hashicorp Vault' — 官方名称，无通用中文译名
  - 'CyberArk Conjur' — 官方名称，无通用中文译名
  - 'A2A Standard' — 官方名称，无通用中文译名
  - 'OpenAI Python SDK' — 官方名称，无通用中文译名
  - 'LlamaIndex' — 官方名称，无通用中文译名
  - 'Langchain Py' — 官方名称，无通用中文译名
  - 'OpenAI' — 官方名称，无通用中文译名
  - 'GitHub' — 官方名称，无通用中文译名
- **协议或代码标识**（15）
  - 'ID' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'TPM' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'RPM' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - '@placeholder:UTC' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'LLM' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'Filesystem' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'BadRequestError（400）' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'AuthenticationError（401）' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'TimeoutError（408）' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
  - 'RateLimitError（429）' — 是枚举值/异常类名/标准缩写，译了会破功能或失指代
- **示例代码**（14）
  - '"your_api_key"' — 可复制执行的代码，必须保持原样
  - '"<your_proxy_base_url>"' — 可复制执行的代码，必须保持原样
  - '"gpt-3.5-turbo"' — 可复制执行的代码，必须保持原样
  - '# model to send to the proxy' — 可复制执行的代码，必须保持原样
  - '"role"' — 可复制执行的代码，必须保持原样
  - '"user"' — 可复制执行的代码，必须保持原样
  - '"content"' — 可复制执行的代码，必须保持原样
  - '"this is a test request, write a short poem"' — 可复制执行的代码，必须保持原样
  - '@placeholder:{"forward_api_key": true, "headers": {"X-Custom": "value"' — 可复制执行的代码，必须保持原样
  - '@placeholder:{"description": "Detects PII in requests"}' — 可复制执行的代码，必须保持原样
- **示例地址/占位符**（2）
  - '# LiteLLM Proxy is OpenAI compatible, Read More: https://docs.litellm.' — 用户要替换成自己的值，译了反而误导
  - '@placeholder:{\n  "mcpServers": {\n    "my_server": {\n      "url": "http' — 用户要替换成自己的值，译了反而误导

## 功能回归
- 全站页面与关键流程: 46/46 页面，4/4 流程
- tooltip 悬停探针: 弹出提示中仍为英文 2 条（详见交互审计口径，数据值不计）
- 密钥与团队增删改: 8/8 通过
- 新建用户与界面开关: 4/4 通过
- toast 提示消息: 3/3 干净，英文 toast 0 条
- 添加模型标签页/日志详情/用量切换/护栏详情: 5/5 通过
- 导航/排序/弹窗/主题/登录态: 7/7 通过

## 仓库状态
- 分支 LiteLLM-Chinese，工作树改动 0 条
