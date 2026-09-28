"""把 client.ts 的统一解析出口接到 zh-runtime 上。

后端（Pydantic 的 ui_field_name / field_description、角色名、护栏动作等）下发的字符串
不在前端源码里，构建期字面量替换覆盖不到，只能在统一解析出口做一次映射。
词典与 zhNode 由 inject_sites.py 生成的 src/lib/zh-runtime.ts 提供，这里只改调用点。
"""

import io

CLIENT = r"D:\zh-ui-lab\dash\src\lib\http\client.ts"
IMPORT = 'import { zhApiText, zhNode } from "@/lib/zh-runtime";'


def main() -> None:
    s = io.open(CLIENT, encoding="utf-8").read()

    old_ok = "    const text = await response.text();\n    return (text ? JSON.parse(text) : undefined) as T;"
    new_ok = "    const text = await response.text();\n    return (text ? zhNode(JSON.parse(text)) : undefined) as T;"
    if old_ok in s:
        s = s.replace(old_ok, new_ok, 1)

    old_err = "        message = deriveErrorMessage(errorBody);"
    new_err = "        message = zhApiText(deriveErrorMessage(errorBody));"
    if old_err in s:
        s = s.replace(old_err, new_err, 1)

    if IMPORT not in s:
        lines = s.split("\n")
        at = next((i for i, line in enumerate(lines) if line.startswith("import ")), 0)
        lines.insert(at, IMPORT)
        s = "\n".join(lines)

    io.open(CLIENT, "w", encoding="utf-8", newline="").write(s)
    for probe in ["zhNode(JSON.parse(text))", "zhApiText(deriveErrorMessage", IMPORT]:
        print("  ", probe, "OK" if probe in s else "MISSING")


if __name__ == "__main__":
    main()

