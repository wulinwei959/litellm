#!/usr/bin/env python3
# 构建期站点注入：在 zh-inject 之前对 dash/src 副本做定点改写，
# 覆盖"运行时拼出来的英文"（prettify、复数、图表系列名、日期格式、角色徽章）。
# 每条替换都要求精确命中预期次数，命中不足即报错退出，防止上游漂移后静默失效。
import json
import re
import sys
from pathlib import Path

LAB = Path("D:/zh-ui-lab")
SRC = LAB / "dash" / "src"
RUNTIME = SRC / "lib" / "zh-runtime.ts"

DYNAMIC = json.loads((LAB / "dynamic-zh.json").read_text(encoding="utf-8"))
API_ZH = {}
for _f in sorted(LAB.glob("api-zh*.json")):
    API_ZH.update(json.loads(_f.read_text(encoding="utf-8")))

UI_DICT = json.loads((LAB / "all-zh.json").read_text(encoding="utf-8"))


def backend_literals() -> set:
    """ast 解析后端全树取字符串常量（能正确还原跨行隐式拼接与 docstring 说明）。

    必须连 enterprise/ 一起扫：部分开关的 description 由企业版扩展提供，
    只扫 litellm/ 会让这些句子在 UI→接口词典桥里被判成"非后端原文"而漏并。
    """
    import ast

    roots = [
        Path("D:/Qoder-Project/LiteLLM/litellm"),
        Path("D:/Qoder-Project/LiteLLM/enterprise"),
        Path("D:/Qoder-Project/LiteLLM/litellm-proxy-extras"),
    ]
    out = set()
    for root in roots:
        for f in root.rglob("*.py"):
            if "__pycache__" in f.parts:
                continue
            try:
                tree = ast.parse(f.read_text(encoding="utf-8", errors="ignore"))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if 6 <= len(node.value) <= 600 and "\n" not in node.value:
                        out.add(node.value)
    return out


# 同一句英文既是前端字面量（走 UI 词典）又可能由后端下发（走接口词典）。
# 只把"确实是后端原文"的 UI 词条并入接口词典，避免把 Models/Save 这类短标签当枚举值改掉。
_BA = backend_literals()
_merged = 0
for _k, _v in UI_DICT.items():
    if len(_k) >= 25 and " " in _k and _k in _BA and _k not in API_ZH:
        API_ZH[_k] = _v
        _merged += 1

# 这些父键下的字符串是标识/枚举，接口出口映射时必须跳过
TECHNICAL_KEYS = [
    "id", "key", "keys", "type", "value", "values", "name", "names", "action", "actions",
    "model", "models", "status", "role", "roles", "format", "path", "endpoint", "field",
    "param", "params", "args", "code", "error_type", "exception", "k", "symbol", "unit",
    "encoding", "scheme", "algorithm", "transport", "provider", "litellm_params", "metadata",
    "category", "categories",
]

# 日期格式：只改含 MMM 的输出格式，纯 ISO 的（用于接口入参）一律不碰
DATE_FORMATS = {
    "MMM D, YYYY [at] HH:mm:ss": "YYYY年M月D日 HH:mm:ss",
    "MMM D, YYYY h:mm:ss A": "YYYY年M月D日 HH:mm:ss",
    "MMM D, YYYY HH:mm:ss": "YYYY年M月D日 HH:mm:ss",
    "D MMM, HH:mm": "M月D日 HH:mm",
    "MMM D, HH:mm:ss": "M月D日 HH:mm:ss",
    "MMM D, h:mm A": "M月D日 HH:mm",
    "MMM D, YYYY": "YYYY年M月D日",
    "MMM D": "M月D日",
}
DATE_KEYS = sorted(DATE_FORMATS, key=len, reverse=True)
DATE_RE = re.compile(r'format\("(%s)"\)' % "|".join(re.escape(k) for k in DATE_KEYS))
LOCALE_RE = re.compile(r"\.to(LocaleDate|Locale|LocaleTime)String\(\)")
JSON_EXIT_RE = re.compile(r"await ([A-Za-z_$][\w$]*)\.json\(\)")

# (相对路径, 原文, 替换文, 预期次数)
PATCHES = [
    (
        "components/AIHub/ModelHubTableColumns.tsx",
        """const formatCapabilityName = (key: string) =>
  key
    .replace(/^supports_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");""",
        """const formatCapabilityName = (key: string) =>
  zhText(
    key
      .replace(/^supports_/, "")
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  );""",
        1,
    ),
    (
        "components/AIHub/ModelHubTable.tsx",
        """    return key
      .replace(/^supports_/, "")
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");""",
        """    return zhText(
      key
        .replace(/^supports_/, "")
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    );""",
        1,
    ),
    (
        "components/AIHub/ModelHubTable.tsx",
        "                    Showing {filteredData.length} of {modelHubData?.length || 0} models",
        "                    共 {filteredData.length} / {modelHubData?.length || 0} 个模型",
        1,
    ),
    (
        "app/(dashboard)/cost-optimization/_components/costOptimizationUtils.ts",
        "export const SAVINGS_SERIES = SAVINGS_DRIVERS.map((d) => d.name);",
        "export const SAVINGS_SERIES = SAVINGS_DRIVERS.map((d) => zhText(d.name));",
        1,
    ),
    (
        "components/TeamsPage/teamTableColumns.tsx",
        "            title={`${item.count} ${item.label}`}",
        "            title={`${item.count} ${zhUnit(item.label)}`}",
        1,
    ),
    (
        "app/(dashboard)/access-groups/_components/AccessGroupsTableColumns.tsx",
        "            title={`${item.count} ${item.label}`}",
        "            title={`${item.count} ${zhUnit(item.label)}`}",
        1,
    ),
    (
        "components/team/memberBudgetReset.ts",
        "export const pluralize = (count: number, singular: string, plural: string): string => (count === 1 ? singular : plural);",
        "export const pluralize = (count: number, singular: string, plural: string): string =>\n  zhUnit(count === 1 ? singular : plural);",
        1,
    ),
    (
        "app/(dashboard)/agents/_components/add_agent_form.tsx",
        'const STEP_TITLES = ["Configure", "Entitlements", "Governance", "Agent Management", "Ready"] as const;',
        'const STEP_TITLES = ["基础配置", "权限范围", "治理", "智能体管理", "确认"] as const;',
        1,
    ),
    (
        "components/Navbar/UserDropdown/UserDropdown.tsx",
        '{userRole && <span className="block truncate text-[11px] text-muted-foreground">{userRole}</span>}',
        '{userRole && <span className="block truncate text-[11px] text-muted-foreground">{zhText(userRole)}</span>}',
        1,
    ),
    (
        "components/SidebarAccountMenu/SidebarAccountMenu.tsx",
        '{userRole && <span className="block truncate text-[11px] text-muted-foreground">{userRole}</span>}',
        '{userRole && <span className="block truncate text-[11px] text-muted-foreground">{zhText(userRole)}</span>}',
        1,
    ),
    (
        "app/(dashboard)/mcp-servers/_components/mcp_discovery.tsx",
        "                  {cat}",
        "                  {zhText(cat)}",
        1,
    ),
    (
        "app/(dashboard)/mcp-servers/_components/mcp_discovery.tsx",
        "                  {category}",
        "                  {zhText(category)}",
        1,
    ),
    (
        "app/(dashboard)/models-and-endpoints/components/ModelRetrySettingsTab.tsx",
        "                  <span>{exceptionType}</span>",
        "                  <span>{zhText(exceptionType)}</span>",
        1,
    ),
    (
        "app/(dashboard)/models-and-endpoints/components/ModelRetrySettingsTab.tsx",
        "aria-label={`${exceptionType} retry count`}",
        "aria-label={`重试次数：${zhText(exceptionType)}`}",
        1,
    ),
    (
        "components/alerting/dynamic_form.tsx",
        "aria-label={`Reset ${value.field_name}`}",
        "aria-label={`重置 ${value.field_name}`}",
        1,
    ),
    (
        "components/common_components/check_openapi_schema.tsx",
        "required: (value: unknown) => (isBlank(value) ? `${label} is required` : true),",
        "required: (value: unknown) => (isBlank(value) ? `${label} 为必填项` : true),",
        1,
    ),
    (
        "utils/textUtils.ts",
        "  const withSpaces = text.replace(/_/g, \" \");\n  return withSpaces.replace(/\\b\\w/g, (char) => char.toUpperCase());",
        "  const withSpaces = text.replace(/_/g, \" \");\n  return zhText(withSpaces.replace(/\\b\\w/g, (char) => char.toUpperCase()));",
        1,
    ),
    (
        "components/shared/table_cells/date_cell.tsx",
        'const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;\n\n',
        "",
        1,
    ),
    (
        "components/shared/table_cells/date_cell.tsx",
        '    ? `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`\n'
        '    : `${MONTHS[date.getMonth()]} ${date.getDate()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;',
        '    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`\n'
        '    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;',
        1,
    ),
    (
        "components/shared/table_cells/date_cell.tsx",
        '  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;',
        '  const day = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;',
        1,
    ),
    (
        "components/shared/table_cells/date_cell.tsx",
        "  return `${day}, ${time} (${timeZone})`;",
        "  return `${day} ${time}（${timeZone}）`;",
        1,
    ),
    (
        "components/SidebarAccountMenu/SidebarAccountMenu.tsx",
        '<Badge variant="secondary">{userRole}</Badge>',
        '<Badge variant="secondary">{zhText(userRole)}</Badge>',
        1,
    ),
    (
        "components/SidebarAccountMenu/SidebarAccountMenu.tsx",
        'const triggerLabel = `Account menu — ${userRole ?? "Unknown role"} — signed in as ${userEmail || userId || "unknown"}`;',
        'const triggerLabel = `账户菜单 — ${zhText(userRole ?? "Unknown")} — 当前登录 ${userEmail || userId || "-"}`;',
        1,
    ),
    (
        "components/organisms/create_key_button.tsx",
        'help={keyOwner === "service_account" ? "required" : ""}',
        'help={keyOwner === "service_account" ? "必填" : ""}',
        1,
    ),
    (
        "components/organisms/create_key_button.tsx",
        'help="required"',
        'help="必填"',
        1,
    ),
    (
        "components/key_value_input.tsx",
        "aria-label={`Remove header ${index + 1}`}",
        "aria-label={`移除第 ${index + 1} 个请求头`}",
        1,
    ),
    (
        "app/(dashboard)/prompts/_components/prompt_editor_view/PromptMessagesCard.tsx",
        "aria-label={`Message ${index + 1} role`}",
        "aria-label={`第 ${index + 1} 条消息的角色`}",
        1,
    ),
    (
        "app/(dashboard)/prompts/_components/prompt_editor_view/conversation_panel/VariableInput.tsx",
        "placeholder={`Enter value for ${varName}`}",
        "placeholder={`填写 ${varName} 的取值`}",
        1,
    ),
    (
        "components/Settings/AdminSettings/UISettings/UISettings.tsx",
        'label="[BETA] Enable Projects (page will refresh)"',
        'label="【测试版】启用项目（页面会刷新）"',
        1,
    ),
    (
        "components/Settings/AdminSettings/UISettings/UISettings.tsx",
        'label="[BETA] Enable Chat page (page will refresh)"',
        'label="【测试版】启用对话页（页面会刷新）"',
        1,
    ),
    (
        "components/EntityUsageExport/ExportTypeSelector.tsx",
        """  const allScopes: { value: ExportScope; title: string; description: string }[] = [
    {
      value: "daily",
      title: `Day-by-day breakdown by ${entityType}`,
      description: `Daily metrics for each ${entityType}`,
    },
    {
      value: "daily_with_keys",
      title: `Day-by-day breakdown by ${entityType} and key`,
      description: `Daily metrics for each ${entityType}, split by API key`,
    },
    {
      value: "daily_with_models",
      title: `Day-by-day by ${entityType} and model`,
      description: "Daily metrics split by model",
    },
    {
      value: "daily_with_users",
      title: `Day-by-day breakdown by ${entityType} and user`,
      description: `Daily metrics for each ${entityType}, split by key owner`,
    },
  ];""",
        """  const allScopes: { value: ExportScope; title: string; description: string }[] = [
    {
      value: "daily",
      title: `按${zhUnit(entityType)}逐日拆分`,
      description: `各${zhUnit(entityType)}的每日指标`,
    },
    {
      value: "daily_with_keys",
      title: `按${zhUnit(entityType)}与密钥逐日拆分`,
      description: `各${zhUnit(entityType)}的每日指标，按 API 密钥拆分`,
    },
    {
      value: "daily_with_models",
      title: `按${zhUnit(entityType)}与模型逐日统计`,
      description: "按模型拆分的每日指标",
    },
    {
      value: "daily_with_users",
      title: `按${zhUnit(entityType)}与用户逐日拆分`,
      description: `各${zhUnit(entityType)}的每日指标，按密钥归属者拆分`,
    },
  ];""",
        1,
    ),
    (
        "components/EntityUsageExport/ExportTypeSelector.tsx",
        '<label className="text-sm font-medium text-foreground block mb-2">Export type</label>',
        '<label className="text-sm font-medium text-foreground block mb-2">导出类型</label>',
        1,
    ),
    (
        "components/Settings/RouterSettings/Fallbacks/FallbackSelectionForm.tsx",
        "group.primaryModel ? group.primaryModel : `Group ${index + 1}`;",
        "group.primaryModel ? group.primaryModel : `分组 ${index + 1}`;",
        1,
    ),
    (
        "components/view_logs/log_filter_logic.tsx",
        '[LOG_FILTER_IDS.CACHE_STATUS]: "Cache",',
        '[LOG_FILTER_IDS.CACHE_STATUS]: "缓存",',
        1,
    ),
    (
        "app/(dashboard)/mcp-servers/_components/MCPToolsetsTab.tsx",
        '({selectedTools.length} tools)',
        '（已选 {selectedTools.length} 个工具）',
        1,
    ),
    (
        "components/shared/DataTable/DataTablePagination.tsx",
        'Showing ${start}-${end} of ${rowCount}',
        '显示第 ${start}-${end} 条，共 ${rowCount} 条',
        1,
    ),
    (
        "app/(dashboard)/models-and-endpoints/components/ModelsTableColumns.tsx",
        'model.model_info.created_by || "Unknown"',
        'model.model_info.created_by || "未知"',
        1,
    ),
    (
        "app/(dashboard)/search-tools/_components/SearchToolView.tsx",
        ' : "Unknown"}',
        ' : "未知"}',
        1,
    ),
    (
        "app/(dashboard)/users/_components/view_users/user_info_view.tsx",
        ' : "Unknown"}',
        ' : "未知"}',
        2,
    ),
    (
        "app/(dashboard)/vector-stores/_components/VectorStoreTableColumns.tsx",
        'file.file_url || "Unknown"',
        'file.file_url || "未知"',
        1,
    ),
    (
        "components/ui/sonner.tsx",
        '      toastOptions={{ classNames: { toast: "cn-toast" } }}',
        '      toastOptions={{ classNames: { toast: "cn-toast" }, closeButtonAriaLabel: "关闭通知" }}',
        1,
    ),
    (
        "components/ui/sonner.tsx",
        '      position="top-right"',
        '      position="top-right"\n      containerAriaLabel="通知"',
        1,
    ),
    # 表格日期/健康状态的兜底占位：Unknown 同时是后端判别值，只能在这一层按站点包 zhText
    (
        "components/VirtualKeysPage/keyTableColumns.tsx",
        'cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback="Unknown" />,',
        'cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback={zhText("Unknown")} />,',
        1,
    ),
    (
        "components/team/TeamVirtualKeysTable.tsx",
        'cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback="Unknown" />,',
        'cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback={zhText("Unknown")} />,',
        1,
    ),
    (
        "components/PublicModelHubTableColumns.tsx",
        'label={model.health_status ?? "Unknown"}',
        'label={model.health_status ?? zhText("Unknown")}',
        1,
    ),
    (
        "components/view_logs/LogDetailsDrawer/RoutingDecisionCard.tsx",
        'return cause ?? "Unknown";',
        'return cause ?? zhText("Unknown");',
        1,
    ),
    (
        "components/per_user_usage.tsx",
        '|| "Unknown"',
        '|| zhText("Unknown")',
        4,
    ),
    # 删除模型确认弹窗的字段值走 value: 键，被"值可能是枚举"的全局规则挡住，逐站点兜底
    (
        "app/(dashboard)/models-and-endpoints/components/AllModelsTab.tsx",
        '|| "Not Set"',
        '|| zhText("Not Set")',
        4,
    ),
    # 试验场的建议问句/追问语料：数组元素不足 4 词，AST 规则不会放行，只能整块改写
    (
        "app/(dashboard)/playground/components/chat_ui/ChatUI.tsx",
        '''                        ? ["What can you help me with?", "Tell me about yourself", "What tasks can you perform?"]
                        : ["Write me a poem", "Explain quantum computing", "Draft a polite email requesting a meeting"]''',
        '''                        ? ["你能帮我做什么？", "介绍一下你自己", "你能执行哪些任务？"]
                        : ["写一首诗", "解释一下量子计算", "起草一封礼貌的会议预约邮件"]''',
        1,
    ),
    (
        "app/(dashboard)/playground/components/compareUI/CompareUI.tsx",
        '''const GENERIC_FOLLOW_UPS = [
  "Can you summarize the key points?",
  "What assumptions did you make?",
  "What are the next steps?",
];''',
        '''const GENERIC_FOLLOW_UPS = ["能总结一下要点吗？", "你做了哪些假设？", "下一步该做什么？"];''',
        1,
    ),
    (
        "app/(dashboard)/playground/components/compareUI/CompareUI.tsx",
        'const SUGGESTED_PROMPTS = ["Write me a poem", "Explain quantum computing", "Draft a polite email requesting a meeting"];',
        'const SUGGESTED_PROMPTS = ["写一首诗", "解释一下量子计算", "起草一封礼貌的会议预约邮件"];',
        1,
    ),
    # 分隔符 OR：全大写无元音被判定符规则挡下，只能逐站点改写
    (
        "app/(dashboard)/vector-stores/_components/vector_store_info.tsx",
        '<span className="px-4 text-muted-foreground text-sm">OR</span>',
        '<span className="px-4 text-muted-foreground text-sm">或</span>',
        1,
    ),
    (
        "components/add_model/AddModelForm.tsx",
        '<span className="px-4 text-muted-foreground text-sm">OR</span>',
        '<span className="px-4 text-muted-foreground text-sm">或</span>',
        1,
    ),
    (
        "components/common_components/user_search_modal.tsx",
        '<div className="text-center">OR</div>',
        '<div className="text-center">或</div>',
        1,
    ),
    (
        "components/team/EditMembership.tsx",
        '<div className="text-center text-sm text-muted-foreground">OR</div>',
        '<div className="text-center text-sm text-muted-foreground">或</div>',
        1,
    ),
]


def render_runtime() -> str:
    def body(obj: dict) -> str:
        return ",\n".join(f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}' for k, v in obj.items())

    return (
        "// 由 zh-ui-lab 构建期生成，请勿手工编辑。\n"
        "const ZH_TEXT: Record<string, string> = {\n" + body(DYNAMIC["text"]) + ",\n};\n\n"
        "const ZH_UNIT: Record<string, string> = {\n" + body(DYNAMIC["unit"]) + ",\n};\n\n"
        "// 后端下发的界面文案（字段名、字段说明、角色名、护栏动作、能力标签等）\n"
        "const API_ZH: Record<string, string> = {\n" + body(API_ZH) + ",\n};\n\n"
        "const API_ZH_TECH_KEYS = new Set(" + json.dumps(TECHNICAL_KEYS) + ");\n\n"
        "/** 展示层文本：只用于渲染位置，绝不改动参与比较的业务值。 */\n"
        "export const zhText = (s: string): string => ZH_TEXT[s] ?? s;\n\n"
        "export const zhUnit = (s: string): string => ZH_UNIT[s] ?? s;\n\n"
        "/** 接口出口用的映射，键名命中标识/枚举白名单时原样返回。 */\n"
        "export const zhApiText = (s: string): string => API_ZH[s] ?? s;\n\n"
        "// 无空格的英文单词大多同时是枚举/判别值（Deny、Vision、Admin），被前端读回来再 POST 回去就会 400。\n"
        "// 因此这类词只在明确的展示型父键下才译；多词句永远是文案，不受此限。\n"
        "const RISKY_WORDS = new Set(\n"
        "  Object.keys(API_ZH).filter((s) => !s.includes(\" \")),\n"
        ");\n"
        "const DISPLAY_KEYS = new Set([\n"
        '  "label", "title", "description", "display_name", "tooltip", "help", "message",\n'
        '  "text", "heading", "caption", "hint", "summary", "detail", "field_description",\n'
        '  "ui_field_name", "friendly_name", "pretty_name", "group", "ui_label", "role_name",\n'
        '  "display_role", "label_with_value",\n'
        "]);\n\n"
        "export function zhNode(node: unknown, parentKey?: string): unknown {\n"
        "  if (typeof node === \"string\") {\n"
        "    if (parentKey && API_ZH_TECH_KEYS.has(parentKey)) return node;\n"
        "    if (RISKY_WORDS.has(node) && !(parentKey && DISPLAY_KEYS.has(parentKey))) return node;\n"
        "    return API_ZH[node] ?? node;\n"
        "  }\n"
        "  if (Array.isArray(node)) return node.map((v) => zhNode(v, parentKey));\n"
        "  if (node && typeof node === \"object\") {\n"
        "    return Object.fromEntries(\n"
        "      Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, zhNode(v, k)]),\n"
        "    );\n"
        "  }\n"
        "  return node;\n"
        "}\n\n"
        "/** fetch 直接 .json() 的出口：结构化响应过一遍 zhNode。返回值刻意宽松，避免 195 处调用点逐一断言类型。 */\n"
        "// eslint-disable-next-line @typescript-eslint/no-explicit-any\n"
        "export const zhJson = (r: { json: () => Promise<unknown> }): Promise<any> =>\n"
        "  r.json().then((v) => zhNode(v) as any);\n"
    )


def add_import(path: Path, symbols: list) -> None:
    code = path.read_text(encoding="utf-8")
    stmt = 'import { %s } from "@/lib/zh-runtime";' % ", ".join(symbols)
    if stmt in code:
        return
    lines = code.split("\n")
    # 插在首条 import 之前，保留 "use client" 指令序言在文件最前
    at = next((i for i, line in enumerate(lines) if line.startswith("import ")), 0)
    lines.insert(at, stmt)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME.write_text(render_runtime(), encoding="utf-8")

    needed: dict = {}
    for rel, old, new, times in PATCHES:
        if times == 0:
            continue
        target = SRC / rel
        if not target.exists():
            print(f"缺失文件: {rel}")
            return 1
        code = target.read_text(encoding="utf-8")
        got = code.count(old)
        if got != times:
            print(f"命中 {got} 次，预期 {times} 次: {rel} :: {old[:60]}")
            return 1
        target.write_text(code.replace(old, new), encoding="utf-8")
        for sym in ("zhText", "zhUnit"):
            if sym + "(" in new:
                needed.setdefault(rel, set()).add(sym)

    date_hits = 0
    for path in list(SRC.rglob("*.tsx")) + list(SRC.rglob("*.ts")):
        if path == RUNTIME:
            continue
        code = path.read_text(encoding="utf-8")
        new_code = DATE_RE.sub(lambda m: 'format("%s")' % DATE_FORMATS[m.group(1)], code)
        if new_code != code:
            date_hits += 1
            path.write_text(new_code, encoding="utf-8")

    # 两趟全站改写合成一趟：
    # 1) 无参 toLocale*() 跟随浏览器 locale（本机是 en-US），必须钉成 zh-CN 才与其余格式一致
    # 2) 直接 fetch + response.json() 的出口要接上映射层——设置类面板的说明文本是后端
    #    JSON schema 下发的，散落在各功能组件里，只包 networking.tsx 会漏掉大半
    locale_hits = 0
    json_exits = 0
    for path in list(SRC.rglob("*.tsx")) + list(SRC.rglob("*.ts")):
        if path == RUNTIME or ".test." in path.name:
            continue
        code = path.read_text(encoding="utf-8")
        code, n_locale = LOCALE_RE.subn(r'.to\1String("zh-CN")', code)
        code, n_json = JSON_EXIT_RE.subn(r"await zhJson(\1)", code)
        if n_locale or n_json:
            locale_hits += n_locale
            json_exits += n_json
            path.write_text(code, encoding="utf-8")
        if n_json:
            needed.setdefault(path.relative_to(SRC).as_posix(), set()).add("zhJson")

    # 标签属性兜底通道：AST 收集器对"单个词的标签"有盲区（Host/Organization 这类
    # 进不了候选清单）。这里只按显式标签属性名匹配，且只换 UI 词典里已收录的值，
    # 因此不会碰到没打算译的字符串。
    label_re = re.compile(
        r'(\b(?:label|title|header|tooltip|placeholder|aria-label|description)(?:=\{?|\s*:)\s*")'
        r"([^\"{}]{2,60})"
        r'(")'
    )
    label_hits = 0
    for path in list(SRC.rglob("*.tsx")) + list(SRC.rglob("*.ts")):
        if path == RUNTIME or ".test." in path.name:
            continue
        code = path.read_text(encoding="utf-8")

        def sub_label(m):
            nonlocal label_hits
            zh = UI_DICT.get(m.group(2))
            if not zh or zh == m.group(2):
                return m.group(0)
            label_hits += 1
            return m.group(1) + zh + m.group(3)

        new_code = label_re.sub(sub_label, code)
        if new_code != code:
            path.write_text(new_code, encoding="utf-8")

    for rel, symbols in needed.items():
        add_import(SRC / rel, sorted(symbols))

    print(
        f"站点注入完成：{len(needed)} 个文件定点改写，日期格式改写 {date_hits} 个文件，"
        f"locale 钉定 {locale_hits} 处，json() 出口 {json_exits} 处，标签兜底 {label_hits} 处"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
