# 中文面板构建期注入工具链（zh-ui-lab）

官方 `ui/litellm-dashboard` 源码保持零改动，中文面板靠这套工具在**构建期**把文案替换进源码副本，
再把静态导出产物挂进代理容器的 `/ui`。因此本目录不是运行时依赖，而是"可复现出中文面板"的构建配方。

## 三层注入，顺序不能换

1. `tools/inject_sites.py` 定点改写。跑在 AST 之前，锚点取自上游纯净源码，因此不受词典影响。
   专治运行时拼出来的英文（角色徽章、复数、图表系列名、日期格式、`OR` 分隔符）。每条替换带预期次数，
   命中数不符直接退出 1，用来在上游改名时立刻报警而不是静默失效。
2. `tools/zh-inject.mjs` AST 字面量替换（@babel/parser + traverse + magic-string），吃 `all-zh.json`。
3. `tools/inject_api.py` 接口出口 `zhNode()`。设置类面板的字段说明由后端 JSON schema 下发，
   必须在全站 `await X.json()` 处接上映射层，只包 `networking.tsx` 会漏掉大半。

词典键是英文原文（渲染态、HTML 实体解码、空白归一）；整句聚合用 `{i}` 插槽回填原始表达式。

## 新增一轮词条

往根目录放一个 `roundNN-zh.json`（或 `api-zhNN.json` / `slug-zh.json` / `dynamic-zh.json`），
`run.sh` 会按文件名自动合并，无需改脚本。`all-zh.json` 是合并产物，不用手工编辑。

三条护栏，改 `zh-inject.mjs` 前先读：

- `NEVER_TRANSLATE` 里的词（`Admin`、`Internal User`、`Unknown` 等）在网络层一律不动。
  无空格的英文单词在接口响应里多半同时是枚举值，前端读回来再 POST 回去就 400；
  而 `roles.ts` 的 `return "Admin"` 一旦被译掉，全站 `userRole === "Admin"` 比较失效，
  "新建密钥/新建团队/邀请用户"按钮整片消失，且**文案审计对此完全无感**，只有功能回归能抓到。
- 这类动态英文一律走展示层 `zhText()`（`src/lib/zh-runtime.ts`，词典 `dynamic-zh.json`），绝不在网络层改数据值。
- `DISPLAY_KEYS` 是接口层的第二道闸：只有父键属于 label/description/ui_field_name/group 等展示键才译单词。

## 前置条件

- Node 20+、Python 3.11+、Docker Desktop，以及同仓库同提交（dev 分支）的一份 LiteLLM。
- 脚本里的路径是写死的：`LAB=/d/zh-ui-lab`、`REPO=/d/Qoder-Project/LiteLLM`。换机器或盘符要改
  `run.sh` / `verify_all.sh` / `quick_check.sh` 顶部，以及 `tools/*.mjs` 里的 `LAB` 常量。
- 首次准备：
  ```bash
  cp -r /d/Qoder-Project/LiteLLM/ui/litellm-dashboard /d/zh-ui-lab/dash   # 构建工作区
  (cd /d/zh-ui-lab/dash && npm ci)
  (cd /d/zh-ui-lab/tools && npm ci)                                        # puppeteer-core + @babel
  cp /d/zh-ui-lab/overlay-ui.example.yml /d/zh-ui-lab/overlay-ui.yml       # 填入自己的 master key
  ```
  部分一次性排查脚本（`tools/diag_*.mjs`、`harvest_*.py`）会引用 `pristine/src`，
  那是 `ui/litellm-dashboard/src` 的一份只读副本，需要时自行 `cp -r` 一份。

## 复跑

```bash
bash run.sh          # 合并词典 -> 三层注入 -> tsc 类型门禁，约 2 分钟
bash verify_all.sh   # 构建 -> 挂载部署 -> 页面/交互审计 -> 六套功能回归 -> 截图，约 60 分钟
bash quick_check.sh  # 跳过两个耗时审计的快速回路，用于确认没引入功能回归
```

`verify_all.sh` 里每一步都是"点了要有反应"的断言，不接受"跳过即通过"：
六套分别是全站 46 页 + 4 关键流程、密钥与团队增删改、新建用户与界面开关、toast 探针、
tooltip 悬停探针、第五套（添加模型标签页/日志详情/用量切换/护栏详情）、第六套（导航/排序/组织门槛/主题/密钥详情/登出重登）。
tooltip 探针若一个提示都没弹出来会直接 exit 1，避免"零命中"被当成"零残留"。

## 残留判据

收敛后剩余的英文不算待办，按五桶逐条给理由：品牌与厂商产品名、示例代码与 JSON、配置键名与示例地址、
协议或代码标识（异常类名/枚举/TPM/RPM/SSO/ID）、数据库里的数据值。
判据是"译了会破功能或失指代"，不是"没做完"。品牌词的处理方式是**句子照译、专名保留**
（`Redis Type` -> `Redis 类型`），而不是整句豁免。

每页一条 404 控制台报错是 Next 静态导出挂到 `/ui` 后的预取噪声（`__next.*.txt?_rsc=`、`/get/latest_release_info`），
上游同样如此，与汉化无关。

## 不要提交的东西

`dash/`、`pristine/`、`ui-mount/`、`ui-official/`（都是可再生产物），`*.log`，
接口响应的本地转储（`resp-*.json`、`live-*.json` 等），以及含真实口令的 `overlay-ui.yml`。
