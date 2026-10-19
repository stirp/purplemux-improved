# 实施及验证记录

## 实施

2026-10-19，按[本需求规格](./spec.md)先补齐行为约定后实现。

- `src/lib/tool-result-presentation.ts`：有界的纯函数识别命令结果、MCP 内容块、嵌套 JSON 和 fulfilled 包装；未知结构返回空识别结果，不修改原字符串。
- `src/components/features/timeline/tool-result-content.tsx`：正文、执行信息、错误、Markdown 与原文折叠展示；混合未知块仍显示 JSON，主题色和容器滚动适配窄屏。
- `src/components/features/timeline/tool-call-item.tsx`：复用共享结果组件，保留调用输入与 diff 的显示条件。
- `messages/*/timeline.json`：11 种语言各补齐 6 个结果标签。
- `tests/unit/lib/tool-result-presentation.test.ts`、`tool-result-content.test.ts`：覆盖识别、错误、边界、原文交互及 ToolCallItem 集成。
- 识别与展示分别承担数据转换和 UI 职责；桌面、移动端、子 Agent 使用同一组件；复用现有 React Markdown、GFM 与主题变量，不增加依赖或通用插件框架，遵循 SRP、DRY、KISS 与 YAGNI。

## 自动化验证

| 检查 | 本次结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过；为当前 worktree 安装已有锁定依赖，未修改包文件 |
| `pnpm exec vitest run tests/unit/lib/tool-result-presentation.test.ts tests/unit/lib/tool-result-content.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/codex-jsonl-parser.test.ts` | 4 个测试文件共 59 项通过 |
| 最终组件样式调整后重跑上述两个新增测试文件 | 30 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/tool-result-presentation.ts src/components/features/timeline/tool-result-content.tsx src/components/features/timeline/tool-call-item.tsx tests/unit/lib/tool-result-presentation.test.ts tests/unit/lib/tool-result-content.test.ts` | 通过，无警告 |
| 本地化 JSON/键/ICU 占位符校验 | 11 种语言的 6 个新增键齐全、占位符一致 |
| `git diff --check` | 通过 |
| `pnpm build` | 通过；Next.js 类型检查、Turbopack 编译、24 个静态页面生成、post-build 与 tsup 服务端构建全部成功 |

初次类型检查发现联合类型未完全收窄、测试 Provider 的必填 children 类型问题，均已修复；ESLint 对测试 createElement 的 children 规则沿用已有测试的单行豁免。第一次构建在该类型问题上失败，最终构建结果单独记录。

## 浏览器验证

使用 `agent-browser --session tool-result-ws-baunie`，本机 Chromium 渲染真实 `ToolResultContent`、NextIntl Provider 和项目 Tailwind 样式的隔离夹具（`node_modules/.cache/tool-result-preview`，本地地址 `http://127.0.0.1:8137`）。未添加产品调试路由，未操作真实会话数据。

- 1280px 桌面、390px 移动端、320px 窄屏：页面横向宽度未溢出（对应 document scrollWidth 为 1265、375、305px，均小于视口宽度，差值为滚动条）。
- 长路径自动换行；MCP 长内容在 320px 高度内滚动；列表、表格、代码和未知资源块同时保留。
- 原文默认折叠，鼠标点击可展开/收起；320px 窄屏下键盘聚焦后 Enter 可展开，完整原文不撑出页面。
- 浅色、深色主题下命令、Markdown、错误和原文可见。发现并修复浅色 Markdown 代码块对比度过低，最终代码色分别为主题前景色 `oklch(0.145 0.01 287)`、`oklch(0.985 0 0)`。
- 页面未报告 JavaScript 运行错误；夹具未提供项目字体和 favicon（静态请求 404），截图字体使用系统回退，不据此认定项目字体已验收。

截图：[桌面浅色](./result/desktop-light.png)、[移动端浅色](./result/mobile-light.png)、[移动端深色](./result/mobile-dark.png)、[320px 原文展开](./result/mobile-320-raw.png)。

## 验收映射与限制

- TR-01～TR-04：识别及组件测试通过，包含未知内容、错误、空输出、实时 props 更新、摘要兼容和 diff 回归。
- TR-05：安全 Markdown 测试、本地化校验、浏览器组件夹具验证通过。
- TR-06：测试、完整类型、ESLint、差异检查和生产构建全部通过。
- 浏览器验收是组件级隔离夹具，未覆盖真实会话的 WebSocket 重连、完整应用导航及物理手机。解析器、协议、配置和状态持久化未改动；仅有摘要的旧数据仍受现有数据量限制。

## Review P2 修复：方括号开头的 Markdown

2026-10-19，同一需求内补齐 TR-02 约定后修正 `tool-result-presentation.ts`。原实现仅凭 `[` 将 MCP 正文归为 JSON，导致合法链接和后续 Markdown 一起降级。

- 有效 JSON 优先保留 JSON 处理；解析失败后，按配对方括号和后续链接标记识别 Markdown 开头，处理嵌套、转义和跨行标签，不新增解析依赖。未知与截断 JSON 仍回退原文。
- 新增数字标签、引用式链接、链接定义、嵌套/转义/跨行标签、含链接字符串的 JSON 和截断 JSON 回归；组件测试断言真实链接 href、标题、列表、表格及完整原文。
- 先运行新增回归，在原实现上得到 6 项失败，复现评审问题；修复后运行 4 个相关测试文件，共 **75 项通过**（命令与上表相同）。
- 本轮重新运行 `pnpm exec tsc --noEmit`，通过；对识别函数与两个测试文件运行 ESLint，通过；`git diff --check` 通过。
- 本轮重新打包组件夹具并使用 `agent-browser --session tool-result-review-baunie` 验证 390px 窄屏：出现“报告”链接、后续标题、列表和表格；链接指向 `https://example.com`，未点击外部链接。截图见[评审修复验证](./result/review-markdown-link.png)。
- 本轮未重新执行完整生产构建，使用组件浏览器验证覆盖此次纯识别逻辑变更；前述生产构建是初次实现的验证证据，不作为本轮构建结果。
