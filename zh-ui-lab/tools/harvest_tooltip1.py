#!/usr/bin/env python3
# tooltip 文案翻译。用前缀回查 tooltip-en.json 取完整原文作键（部分条目在终端里被截断）。
import io
import json
import sys

LAB = r"D:/zh-ui-lab/"

PAIRS = [
    ("Advanced parameters are only supported", "目前只有对话类模型支持高级参数"),
    ("Apply action to all PII types", "对全部个人信息类型统一应用该动作"),
    ("Block returns an error when a forbidden tool", "拦截会在被禁止的工具被调用时返回错误；改写只剥掉这次工具调用，请求继续处理。"),
    ("Choose between LiteLLM API session management", "在 LiteLLM 接口侧会话管理（使用 previous_response_id）与界面侧会话管理之间选择"),
    ("Configure the input parameters", "配置这次工具调用的输入参数"),
    ("Controls randomness", "控制随机性。取值越低输出越稳定，越高越发散。"),
    ("Copy agent name", "复制智能体名称"),
    ("Copy model name", "复制模型名称"),
    ("Counted by the gateway middleware", "由网关中间件在每次请求应答时计数，覆盖 LLM、MCP 与 A2A 端点。"),
    ("Default cost charged for each tool call", "调用该服务器每个工具的默认费用。"),
    ("Delete fallback", "删除降级"),
    ("ESC to close", "按 ESC 关闭"),
    ("Edit fallback", "编辑降级"),
    ("Estimated latency overhead", "预估为每次请求增加的延迟开销"),
    ("LiteLLM will fetch /.well-known/agent-card.json", "LiteLLM 会从该地址拉取 /.well-known/agent-card.json，并让你选择要暴露哪些技能与"),
    ("Maximum number of tokens to generate", "响应最多生成的 Token 数。"),
    ("Only capabilities LiteLLM can faithfully proxy", "这里只列出 LiteLLM 目前能完整代理的能力，其余（如推送通知、扩展）暂不展示。"),
    ("Override the default cost for specific tools", "为指定工具覆盖默认费用。留空则使用默认费率。"),
    ("Press Enter to submit", "按 Enter 发送。Shift+Enter 换行。"),
    ("Requests that failed to route to a provider", "未能路由到服务商的请求"),
    ("Run Python code to generate files", "运行 Python 代码以生成文件、图表并分析数据。容器会自动创建。"),
    ("Score × Weight", "得分 × 权重 —— 每个判定条件对总分的贡献比例"),
    ("Search MCP servers by name or description", "按名称或描述搜索 MCP 服务器"),
    ("Search agents by name or description", "按名称或描述搜索智能体"),
    ("Select a well-known logo or paste a URL", "选择内置标志或直接粘贴图片地址。标志会显示在管理页与对话页。"),
    ("Streams the answer token by token", "逐 Token 流式返回答案。取消勾选则发送非流式请求，一次性渲染完整结果。"),
    ("Test fallback", "测试降级"),
    ("This OAuth server has no flow set", "该 OAuth 服务器尚未选择流程（机器对机器 还是 交互式）。请打开它并选择 OAuth 流程。"),
    ("Time to first token", "首 Token 时延"),
    ("Total latency", "总延迟"),
    ("View blast radius", "查看影响范围"),
    ("Weighted average of all criterion scores", "所有判定条件得分的加权平均。每个条件的权重（%）在创建评测时设定。"),
    ("When enabled, only agents with reachable URLs", "启用后，只显示地址可达的智能体"),
    ("share of all measured turns that missed cache", "在全部被统计的轮次中，因回到更低档位而晚于缓存失效时点、从而未命中缓存的占比"),
]


def main():
    todo = json.load(io.open(LAB + "tooltip-en.json", encoding="utf-8"))
    out, bad = {}, []
    for prefix, zh in PAIRS:
        hits = [t for t in todo if t.startswith(prefix)]
        if len(hits) == 1:
            out[hits[0]] = zh
        else:
            bad.append((prefix, len(hits)))
    json.dump(out, io.open(LAB + "round29-zh.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("落词典:", len(out), "/", len(PAIRS), " 未唯一命中:", bad)
    return 0


if __name__ == "__main__":
    sys.exit(main())
