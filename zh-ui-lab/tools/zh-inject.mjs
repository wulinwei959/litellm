// 构建期中文注入器。
//   node zh-inject.mjs apply <srcDir> <dict.json>
//   node zh-inject.mjs scan  <srcDir>
// 词典 key 用英文原文（渲染态，空白归一）。只有命中的串才会被替换。
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";
import MagicString from "magic-string";

const traverse = traverseMod.default ?? traverseMod;

const DENY_ATTRS = new Set([
  "name", "value", "type", "role", "className", "class", "id", "href", "src", "key",
  "data-slot", "data-testid", "data-state", "data-variant", "asChild", "as", "variant",
  "size", "to", "viewBox", "fill", "stroke", "width", "height", "x", "y", "d", "rx",
  "field", "accessorKey", "accessorFn", "dataIndex", "htmlFor", "target", "rel",
  "tabIndex", "autoComplete", "form", "slot", "style", "xmlns", "prefix", "icon",
]);
const DENY_OBJ_KEYS = new Set([
  "scope", "type", "value", "key", "id", "role", "variant", "size", "method", "status",
  "mode", "category", "source", "format", "unit", "level", "severity", "name", "path",
  "href", "to", "class", "className", "field", "column", "event", "action", "command",
  "color", "endpoint", "transport", "auth_type", "custom_llm_provider", "model",
  "provider", "token", "version", "entity", "resource", "kind", "channel", "algorithm",
  "scheme", "style", "position", "side", "align", "trigger", "orientation", "dir",
  "lang", "locale", "media", "code", "slug", "symbol", "operator", "namespace",
  "collection", "table", "index", "bucket", "region", "currency", "encoding", "mime",
  "k", "fn", "ref", "test", "testId", "headerClassName", "cellClassName",
]);

const TECH_WORDS = new Set([
  "curl", "python", "javascript", "typescript", "json", "yaml", "yml", "sql", "html", "css",
  "oklab", "monospace", "alphanumeric", "numeric", "decimal", "datetime", "twoLine", "ghost",
  "outline", "chips", "badge", "block", "flex", "center", "pointer", "smooth", "push", "italic",
  "nowrap", "pre-wrap", "inherit", "neutral", "object", "string", "number", "boolean", "function",
  "default", "custom", "hidden", "uppercase", "auto", "none", "select", "short", "sm", "md", "lg",
]);

// 角色值是程序语义：userRole 全站有几十处 === 比较，一旦被当文案换掉，
// 权限判定整片失效（表现为"新建 X"按钮消失）。展示层另有 zhText() 负责译。
const NEVER_TRANSLATE = new Set([
  "Admin", "Admin Viewer", "Internal User", "Internal Viewer", "Team Admin",
  "Proxy Admin User", "Org Admin", "User", "App User", "Unknown",
  "proxy_admin", "proxy_admin_viewer", "internal_user", "internal_user_viewer",
]);

const TOAST_METHODS = new Set(["success", "error", "info", "warning", "message", "loading", "fromError", "customError"]);

const DISPLAY_HELPERS = new Set(["labelWithHint", "labelWithTooltip", "makeLabel", "fieldLabel", "labelWithDocsHint", "textField"]);
// textField(字段名, 标签, 占位提示, 值) 的首参是表单字段 id，译掉会断提交
const HELPERS_WITH_ID_FIRST = new Set(["textField"]);

const LOCALES = { "en-US": "zh-CN", "en-GB": "zh-CN", "en": "zh-CN" };

// 只认"前缀 + Tailwind 尺寸/数字/方括号"的真类名。此前 top-/left-/right-/bottom-/rounded
// 裸前缀也会命中，把 "top-level routing strategy"、"rounded value" 这类正常英文句子整条拒掉。
const CSS_TOKEN_RE =
  /\b(z-\d|text-(xs|sm|base|lg|xl|\[)|bg-|px-|py-|mt-|mb-|ml-|mr-|(left|right|top|bottom)-(sm|md|lg|xl|\d|\[|full)|transition-(all|colors|opacity|shadow|transform|\d)|duration-\d|font-(thin|light|normal|medium|semibold|bold|extrabold|black|\[)|rounded(-(sm|md|lg|xl|[23]xl|none|full|\[)|\d)?\b|border-(\d|\[|solid|dashed|dotted)|w-\d|h-\d|grid-cols)/;
const CODEISH_RE =
  /(^[\s]*[{\["`~$])|(:\s*\{)|^(gpt-|claude-|text-embedding|dall-|whisper-|nim-|mistral-|llama-|o[13]-)|\.(json|sql|py|ts|tsx|md|sh|ya?ml)\b|^\/\w|^\$\{/;

function hasCjk(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x3000 && c <= 0x9fff) return true;
  }
  return false;
}

function looksTechnical(t, dict) {
  const low = t.toLowerCase();
  if (TECH_WORDS.has(low)) return true;
  // 全小写无空格的 token 基本都是标识符；但人工收录进词典的（of、here）例外放行。
  if (/^[a-z0-9][a-z0-9_.\-/]*$/.test(t)) return !(dict && Object.hasOwn(dict, t));
  // 全大写且无元音的多字母 token 才是 HTTP 动词/缩写；OBSERVABILITY 这类是标题。
  if (/^[A-Z]{2,}$/.test(t) && !/[AEIOUY]/.test(t)) return true;
  if (/(var\(--|--color|color-mix|\bpx\b|#\w{3,8}\b|em;|\.\d+em)/.test(t)) return true;
  if (/[<>[\]`()=;]|\\n/.test(t) && !/\s/.test(t)) return true;
  if (/^(https?|ftp|mailto|ws):\/\//.test(t)) return true;
  if (/\b(text|bg|border|rounded|grid|col|row|w|h|m|p)-(xs|sm|md|lg|xl|\d)\b/.test(t)) return true;
  return false;
}

// HTTP 头名、认证方案等协议字面量：出现在任何位置都不能译，否则 fetch 会因非 ISO-8859-1 抛错。
const PROTECTED_WORDS = new Set([
  "Authorization", "Content-Type", "Content-Length", "Accept", "Accept-Encoding",
  "Accept-Language", "Origin", "Host", "Cookie", "Set-Cookie", "User-Agent", "Referer",
  "Cache-Control", "Connection", "Date", "Server", "Via", "Bearer", "Basic", "Digest",
  "X-Api-Key", "X-API-Key", "api-key", "X-Forwarded-For", "If-None-Match", "ETag",
]);
// 这些对象键/属性名下的字符串值是协议数据，不是文案。
const PROTECTED_PROP_KEYS = new Set([
  "headers", "headerName", "authHeaderName", "key", "keys", "method",
  "algorithm", "encoding", "scope", "scopes", "grant_type", "response_type",
]);

function hasProtectedAncestor(p) {
  let cur = p.parentPath;
  for (let depth = 0; cur && depth < 4; depth++, cur = cur.parentPath) {
    const t = cur.node.type;
    if (t === "ObjectProperty") {
      const k =
        cur.node.key.type === "Identifier" ? cur.node.key.name : cur.node.key.type === "StringLiteral" ? cur.node.key.value : "";
      if (PROTECTED_PROP_KEYS.has(k)) return true;
    }
    if (t === "CallExpression") {
      const callee = cur.node.callee;
      if (callee.type === "MemberExpression" && /setHeader|append|headers/i.test(String(callee.property?.name || ""))) return true;
    }
  }
  return false;
}

function isTranslatable(raw, exemptCodeish, dict) {
  if (!raw) return false;
  const t = raw.trim();
  if (PROTECTED_WORDS.has(t)) return false;
  if (t.length < 2) return false;
  if (hasCjk(t)) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^&[a-z]+;$/.test(t)) return false;
  if (CSS_TOKEN_RE.test(t)) return false;
  if (!exemptCodeish && CODEISH_RE.test(t.replace(/\{\d+\}/g, "X"))) return false;
  if (looksTechnical(t, dict)) return false;
  return true;
}

const ENTITIES = { "&apos;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#39;": "'", "&ndash;": "-", "&mdash;": "-", "&rarr;": "->", "&larr;": "<-" };
// JSX 文本里的 HTML 实体在渲染后才成为最终文案，词典 key 必须用解码后的形态。
const decode = (s) => s.replace(/&[a-zA-Z]+;|&#\d+;/g, (m) => ENTITIES[m] ?? m);
const norm = (s) => decode(s).replace(/\s+/g, " ").trim();
const attrNameOf = (node) => (node?.type === "JSXAttribute" ? node.name?.name : null);

function classify(p) {
  // 模板字符串没有 .value，只有 quasis；此前为了躲一处 undefined.trim() 直接把
  // 非 StringLiteral 全部拒了，顺带把模板串的文案位也一起漏掉了。
  const isLit = p.node.type === "StringLiteral" && typeof p.node.value === "string";
  if (!isLit && p.node.type !== "TemplateLiteral") return null;
  const val = isLit ? p.node.value : "";
  if (NEVER_TRANSLATE.has(val)) return null;
  if (hasProtectedAncestor(p)) return null;
  let cur = p.parentPath;
  while (
    cur &&
    [
      "ConditionalExpression",
      "LogicalExpression",
      "ParenthesizedExpression",
      "TSAsExpression",
      "TSSatisfiesExpression",
      // 渲染回调（children={(v) => 无数据时 ? "Select Organization" : ...}）返回的就是要显示的字，
      // 此前被当成"函数实参"一类拒掉，整类 render-prop 文案全部漏译。
      "ArrowFunctionExpression",
    ].includes(cur.node.type)
  ) {
    cur = cur.parentPath;
  }
  if (!cur) return null;
  // 只有字符串本身就是比较操作数时才是程序语义。此前按"任意祖先里有比较式"判定，
  // 把 cond && <p>文案</p> 这类嵌在比较式下面的展示文案一起误杀了。
  const guard = p.findParent((q) => {
    const n = q.node;
    if (n.type === "BinaryExpression") return n.left === p.node || n.right === p.node;
    if (n.type === "SwitchCase" || n.type === "ConditionalExpression") return n.test === p.node;
    if (n.type === "MemberExpression") return n.property === p.node;
    return false;
  });
  if (guard) return null;

  const t = cur.node.type;
  if (t === "JSXAttribute") {
    const a = attrNameOf(cur.node);
    return a && !DENY_ATTRS.has(a) ? "attr" : null;
  }
  if (t === "JSXExpressionContainer") {
    const holder = cur.parentPath?.node;
    if (holder?.type === "JSXAttribute") {
      const a = attrNameOf(holder);
      return a && !DENY_ATTRS.has(a) ? "attr" : null;
    }
    return holder?.type === "JSXElement" ? "jsx-child-expr" : null;
  }
  if (t === "ObjectProperty") {
    // 带引号的对象键（"Auto-router": 1）是标识符，改了会破坏类型与查表。
    if (cur.node.key === p.node) return null;
    const k =
      cur.node.key.type === "Identifier" ? cur.node.key.name : cur.node.key.type === "StringLiteral" ? cur.node.key.value : null;
    if (!k) return null;
    const quotedCaps = /^[A-Z][A-Z0-9 ._-]*$/.test(k) && /[A-Z]{3}/.test(k);
    // name 大量用于判别值（name: "teams"），只有多词且首字母大写的显示名才放行。
    const multiWordLabel = k === "name" && /\s/.test(val.trim()) && /^[A-Z]/.test(val.trim());
    if (DENY_OBJ_KEYS.has(k) && !quotedCaps && !multiWordLabel) return null;
    return "object";
  }
  // 只认变量赋值与 return 上的标签串。函数实参和数组元素大量是枚举/判别值
  // （setActiveTab("Chat")、variant="admin-panel"），改了会破坏类型与逻辑。
  if (["VariableDeclarator", "AssignmentExpression", "ReturnStatement"].includes(t)) {
    // 带类型标注的变量声明（const x: ClassificationRubric = "Agentic"）是判别值，不是文案。
    if (t === "VariableDeclarator" && cur.node.id?.typeAnnotation) return null;
    return "expr";
  }
  // 默认参数值（title = "Usage View"）按定义就是展示文案。
  if (t === "AssignmentPattern") return "expr";
  // 数组：只放行多词元素（提示词、说明句），单词数组常是标签页/枚举集合。
  // 数组元素大量是角色/枚举集合（rolesWithWriteAccess = ["Internal User", "Admin", ...]），
  // 译掉会让 .includes(userRole) 判假、按钮整片消失。只放行长句（≥4 词）元素。
  if (t === "ArrayExpression") return (val.match(/\s/g) || []).length >= 3 ? "expr" : null;
  // 函数实参大量是枚举值（setActiveTab("Chat")），只对明确的"标签生成函数"放行。
  if (t === "CallExpression") {
    const callee = cur.node.callee;
    const fn = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" ? String(callee.property?.name || "") : "";
    if (DISPLAY_HELPERS.has(fn)) {
      const idx = cur.node.arguments.indexOf(p.node);
      if (idx === 0 && HELPERS_WITH_ID_FIRST.has(fn)) return null;
      return "expr";
    }
    // toast.success("保存成功") 这类提示消息是纯展示文案，此前被当成普通实参漏掉。
    if (callee.type === "MemberExpression" && callee.object?.type === "Identifier" && callee.object.name === "toast") {
      return TOAST_METHODS.has(String(callee.property?.name || "")) ? "expr" : null;
    }
    return null;
  }
  return null;
}

// 把 <p>Anyone with <code>X</code> is unset</p> 这类交织句子合成一个带 {i} 占位的整句 key。
function collectGroups(code, hits, dict) {
  traverse(hits.ast, {
    JSXElement(p) {
      const kids = p.node.children;
      if (kids.length < 3) return;
      let textPieces = 0;
      let elemPieces = 0;
      const parts = [];
      let ok = true;
      for (const c of kids) {
        if (c.type === "JSXText") {
          const v = norm(code.slice(c.start, c.end));
          if (!v) continue;
          textPieces += 1;
          parts.push({ kind: "text", text: v });
        } else if (c.type === "JSXExpressionContainer") {
          const e = c.expression;
          if (e.type === "JSXEmptyExpression") continue;
          if (e.type === "StringLiteral") {
            textPieces += 1;
            parts.push({ kind: "text", text: norm(e.value) });
          } else if (e.type === "TemplateLiteral" && e.expressions.length === 0) {
            textPieces += 1;
            parts.push({ kind: "text", text: norm(e.quasis.map((q) => q.value.raw).join(" ")) });
          } else {
            elemPieces += 1;
            parts.push({ kind: "slot", src: code.slice(c.start, c.end) });
          }
        } else if (c.type === "JSXElement" || c.type === "JSXFragment") {
          elemPieces += 1;
          parts.push({ kind: "slot", src: code.slice(c.start, c.end) });
        } else {
          ok = false;
          break;
        }
      }
      if (!ok || elemPieces === 0 || textPieces === 0) return;
      const merged = parts.map((x, i) => (x.kind === "text" ? x.text : `{${i}}`)).join(" ");
      if (!isTranslatable(merged, false, dict)) return;
      const first = kids.find((k) => code.slice(k.start, k.end).trim().length > 0);
      const last = [...kids].reverse().find((k) => code.slice(k.start, k.end).trim().length > 0);
      hits.groups.push({ start: first.start, end: last.end, text: merged, parts });
    },
  });
}

function collectTargets(code, ast, dict) {
  const hits = { items: [], groups: [], prettifyCalls: [], ast };
  const spanOf = (start, end) => {
    const raw = code.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    return [start + lead, end - trail];
  };
  const push = (start, end, text, restore, exemptCodeish) => {
    if (!isTranslatable(text, exemptCodeish, dict)) return;
    hits.items.push({ start, end, text: norm(text), restore });
  };
  traverse(ast, {
    JSXText(p) {
      const [s, e] = spanOf(p.node.start, p.node.end);
      push(s, e, code.slice(s, e));
    },
    StringLiteral(p) {
      // 日期/数字格式化的 locale 标签：整体切到 zh-CN，图表才会显示"8月28日"。
      if (LOCALES[p.node.value] && (p.parent.type === "CallExpression" || p.parent.type === "NewExpression")) {
        hits.items.push({ start: p.node.start + 1, end: p.node.end - 1, text: p.node.value, localeTo: LOCALES[p.node.value] });
        return;
      }
      if (!classify(p)) return;
      push(p.node.start + 1, p.node.end - 1, p.node.value);
    },
    // 面包屑标题由 prettify(route) 在运行时拼出，源码里没有字面量，只能在调用点注入查表。
    CallExpression(p) {
      if (p.node.callee.type !== "Identifier" || p.node.callee.name !== "prettify") return;
      const a = p.node.arguments[0];
      if (!a) return;
      hits.prettifyCalls.push({ start: p.node.start, end: p.node.end, arg: code.slice(a.start, a.end) });
    },
    TemplateLiteral(p) {
      const container = p.parentPath?.node;
      if (container?.type === "JSXExpressionContainer") {
        const holder = p.parentPath.parentPath?.node;
        if (holder?.type === "JSXAttribute" && DENY_ATTRS.has(attrNameOf(holder))) return;
      } else if (!classify(p)) {
        // 赋给变量/作为属性值传入的模板串（triggerLabel = `Account menu — ...`）同样是文案。
        return;
      }
      const exprs = p.node.expressions;
      if (!exprs.length || exprs.length > 4) return;
      // 多插值模板用 {0} {1} ... 标记槽位，回填时还原成原始表达式源码。
      let text = "";
      const restore = [];
      p.node.quasis.forEach((q, i) => {
        text += q.value.raw;
        if (i < exprs.length) {
          text += `{${i}}`;
          restore.push("${" + code.slice(exprs[i].start, exprs[i].end) + "}");
        }
      });
      push(p.node.start + 1, p.node.end - 1, text, restore, true);
    },
  });
  collectGroups(code, hits, dict);
  return hits;
}

function walkDir(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (
      /\.(tsx|jsx|ts|js)$/.test(entry.name) &&
      !/\.(test|stories|spec)\./.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    )
      out.push(full);
  }
  return out;
}

const jstr = (s) => `{"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"}`;

function applyFile(file, dict, slugDict) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"] });
  const hits = collectTargets(code, ast, dict);
  const s = new MagicString(code);

  // 整句聚合优先：命中后屏蔽其内部零散串，避免半中半英。
  const used = [];
  let n = 0;
  for (const g of hits.groups) {
    const zh = dict[g.text];
    if (!zh) continue;
    // split 带捕获组后：偶数下标是文本段，奇数下标是占位符的数字，不能当文本输出。
    const segs = zh.split(/\{(\d+)\}/);
    let out = "";
    for (let i = 0; i < segs.length; i += 2) {
      if (segs[i]) out += jstr(segs[i]);
      const idx = Number(segs[i + 1]);
      const slot = g.parts[idx];
      if (slot?.kind === "slot") out += slot.src;
    }
    if (!out) continue;
    s.overwrite(g.start, g.end, out);
    used.push([g.start, g.end]);
    n += 1;
  }
  for (const c of hits.prettifyCalls) {
    const table = Object.entries(slugDict)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(", ");
    if (!table) continue;
    s.overwrite(c.start, c.end, `({ ${table} })[${c.arg}] ?? prettify(${c.arg})`);
    n += 1;
  }
  for (const h of hits.items) {
    if (used.some(([a, b]) => h.start >= a && h.end <= b)) continue;
    const zh = h.localeTo ? h.localeTo : dict[h.text];
    if (!zh) continue;
    let out = h.localeTo ?? zh;
    if (Array.isArray(h.restore)) {
      out = out.replace(/\{(\d+)\}/g, (_, i) => h.restore[Number(i)] ?? "");
    } else if (h.restore) {
      out = out.replace("{}", h.restore);
    }
    s.overwrite(h.start, h.end, out);
    n += 1;
  }
  if (n > 0) fs.writeFileSync(file, s.toString());
  return { n, total: hits.items.length + hits.groups.length };
}

function uncoveredIn(file, dict) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"] });
  const hits = collectTargets(code, ast, dict);
  const out = [];
  for (const g of hits.groups) if (!dict[g.text]) out.push(g.text);
  for (const h of hits.items) if (!dict[h.text]) out.push(h.text);
  return out;
}

const [mode, target, argPath] = process.argv.slice(2);

if (mode === "apply") {
  const dict = JSON.parse(fs.readFileSync(argPath, "utf8"));
  const slugPath = path.join(path.dirname(argPath), "slug-zh.json");
  const slugDict = fs.existsSync(slugPath) ? JSON.parse(fs.readFileSync(slugPath, "utf8")) : {};
  const files = walkDir(target);
  let applied = 0;
  let touched = 0;
  let parseFailed = 0;
  const failReasons = new Map();
  const failSample = new Map();
  const uncovered = new Map();
  const where = new Map();
  for (const f of files) {
    let r;
    try {
      r = applyFile(f, dict, slugDict);
    } catch (e) {
      parseFailed += 1;
      const msg = String(e && e.message ? e.message : e).slice(0, 90);
      failReasons.set(msg, (failReasons.get(msg) ?? 0) + 1);
      if (failReasons.get(msg) === 1) failSample.set(msg, path.basename(f));
      continue;
    }
    applied += r.n;
    touched += r.n > 0 ? 1 : 0;
    try {
      for (const t of uncoveredIn(f, dict)) {
        uncovered.set(t, (uncovered.get(t) ?? 0) + 1);
        if (!where.has(t)) where.set(t, new Set());
        where.get(t).add(path.relative(target, f));
      }
    } catch {
      /* 已统计过 */
    }
  }
  const list = [...uncovered.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  fs.writeFileSync(path.join(path.dirname(target), "uncovered.json"), JSON.stringify(list, null, 1));
  fs.writeFileSync(
    path.join(path.dirname(target), "uncovered-files.json"),
    JSON.stringify(
      [...where.entries()]
        .map(([text, files]) => ({ text, files: [...files] }))
        .sort((a, b) => a.files[0].localeCompare(b.files[0]) || a.text.localeCompare(b.text)),
      null,
      1,
    ),
  );
  console.log(
    JSON.stringify({
      files: files.length,
      applied,
      touched,
      parseFailed,
      uncoveredInstances: [...uncovered.values()].reduce((a, b) => a + b, 0),
      uncoveredUnique: uncovered.size,
      failReasons: [...failReasons.entries()].map(([m, c]) => ({ msg: m, count: c, file: failSample.get(m) })),
    }),
  );
} else if (mode === "scan") {
  const files = walkDir(target);
  const uniq = new Map();
  let total = 0;
  for (const f of files) {
    try {
      for (const t of uncoveredIn(f, {})) {
        total += 1;
        uniq.set(t, (uniq.get(t) ?? 0) + 1);
      }
    } catch (e) {
      console.log("PARSE-FAIL", path.relative(target, f), String(e.message).slice(0, 60));
    }
  }
  const list = [...uniq.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count);
  fs.writeFileSync(path.join(path.dirname(target), "scan-report.json"), JSON.stringify(list, null, 1));
  console.log(JSON.stringify({ files: files.length, total, uniqueStrings: uniq.size }));
} else {
  console.log("usage: zh-inject.mjs <apply|scan> <dir> [dict.json]");
}
