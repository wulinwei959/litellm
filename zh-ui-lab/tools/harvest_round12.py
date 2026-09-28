#!/usr/bin/env python3
# 第 12 轮收割：按 classify_residual 的索引结果落词典。
# 键直接取 todo12.json 里的完整原文，避免我手抄时被显示截断。
import io
import json
import os

LAB = r"D:\zh-ui-lab"

# 索引对应 classify_residual.py 输出的排序键列表
ZH = {
    0: "一个模型访问组可以挂一份预算，凡按名称被授予该组的密钥共用这份额度；通过通配符或团队继承拿到模型的密钥不走这份预算。",
    1: "当用户当月（UTC）花费超过该美元金额时发出告警。默认关闭。",
    2: "当用户当日（UTC）花费超过该美元金额时发出告警。默认关闭。",
    3: "预算告警的缓存有效期，用于避免同一预算被反复触发刷屏。单位为秒。",
    4: "模型故障告警的缓存有效期，设定错误统计时间窗。默认 1 分钟。单位为秒。",
    5: "服务商区域故障告警的缓存有效期。同一区域有 2 个以上模型报错时发送告警，此处设定错误统计时间窗。单位为秒。",
    6: "为该团队在单个模型上的花费设置上限，每个上限可有自己的重置周期。团队内所有密钥共享该上限，除非密钥自行设置了更低的限额。",
    7: "界面专用开关配置",
    8: "当用户当日花费超过其近期日均花费的这个倍数时，标记为异常。",
    9: "向下游 LLM 转发服务商鉴权请求头（x-api-key、x-goog-api-key、api-key、ocp-apim-subscription-key），会覆盖部署中已配置的密钥。",
    10: "检查缓存以决定是否需要发送报告的频率，属后台任务。默认每小时一次。单位为秒。",
    11: "接收部署延迟/失败上报的频率。默认 12 小时。单位为秒。",
    12: "检查各用户花费阈值与异常的间隔（秒）。默认每小时一次。",
    13: "启用后，内部用户不能在界面添加模型",
    14: "内部用户（只读）",
    15: "内部用户（非管理员）在界面侧栏可见的页面标识列表。未设置时，按角色权限决定全部可见。",
    16: "缓存中最多保存的错误条数，按模型/区域计，防止内存膨胀。",
    17: "触发异常告警前，用户当日需要达到的最低花费（美元），用于减少误报。",
    18: "节点（单实例）",
    19: "注意：这里只列出内部用户角色可访问的页面。仅管理员可见的页面不会出现在列表中，因为无论如何设置都不会对内部用户开放。",
    20: "用于计算用户日均花费以做异常检测的回看天数。",
    21: "可选请求头，其取值用于在没有 JWT 身份的调用方中标识客户端。该值由客户端自行填写，因此属于策略约束而非安全凭据。",
    22: "向所有面板用户发布公告。支持 Markdown；公告会显示在每页顶部导航下方，直到你撤下。用户可以自行关闭。",
    23: "别名用于在面板和网关日志里展示这个客户端；取值是标识客户端的确切 JWT 声明或请求头值，例如 OAuth 的 client_id 声明。",
    24: "计为模型/区域轻度故障的错误数（不计 400 错误码）。",
    25: "计为模型/区域严重故障的错误数（不计 400 错误码）。",
}


def main():
    todo = json.load(io.open(os.path.join(LAB, "todo12.json"), encoding="utf-8"))
    keys = sorted(todo)
    ui_candidates = {e["text"] for e in json.load(io.open(os.path.join(LAB, r"dash\uncovered-files.json"), encoding="utf-8"))}
    existing = json.load(io.open(os.path.join(LAB, "all-zh.json"), encoding="utf-8"))

    ui, api, missing = {}, {}, []
    for idx, zh in ZH.items():
        if idx >= len(keys):
            missing.append(idx)
            continue
        key = keys[idx]
        if key in ui_candidates:
            ui[key] = zh
        if todo[key] == "api":
            api[key] = zh
    if missing:
        print("索引越界:", missing)
        return 1
    json.dump(ui, io.open(os.path.join(LAB, "round12-zh.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(api, io.open(os.path.join(LAB, "api-zh12.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("UI 词典:", len(ui), " 接口词典:", len(api))
    for k in list(ui)[:4]:
        print("  UI:", k[:60])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
