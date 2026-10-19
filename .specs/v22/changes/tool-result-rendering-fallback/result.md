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

## PR #67 Review 5572775009 修复

2026-10-19，读取[指定 review](https://github.com/stirp/purplemux-improved/pull/67#pullrequestreview-5572775009)，确认本地与 PR head 均为 `3e597b5d40f195b7e8d50dd991329114445eae2d`，在本需求规格内补齐两项约定后修复。

- [4314789725](https://github.com/stirp/purplemux-improved/pull/67#discussion_r4314789725)：MCP `content` 为空、全未知块或无效文本块时，仍保留包装中的 `isError: true`，展示错误提示及原文。识别函数携带 JSON 来源字符串，直接回退时不改变空白；嵌套内容、数组和 fulfilled 包装继续传递错误。后续正常结果清除错误提示。
- [4314789737](https://github.com/stirp/purplemux-improved/pull/67#discussion_r4314789737)：为开头的简写引用链接扫描后续匹配定义，统一标签大小写和空白；支持转义标签、换行标签及下一行目标地址。未找到匹配定义或定义为空时保留原文，有效 JSON 仍优先。
- 变更集中在 `tool-result-presentation.ts`，复用现有错误提示、原文和 Markdown 展示；无新依赖、接口或 UI 状态，保留识别/展示职责分离。

本轮实际验证：

| 检查 | 结果 |
| --- | --- |
| 修改源码前运行新增回归 | 12 项失败，复现两项 review 问题及其边界 |
| `pnpm exec vitest run tests/unit/lib/tool-result-presentation.test.ts tests/unit/lib/tool-result-content.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/codex-jsonl-parser.test.ts` | 89 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/tool-result-presentation.ts tests/unit/lib/tool-result-presentation.test.ts tests/unit/lib/tool-result-content.test.ts` | 通过，无警告 |
| `git diff --check` | 通过 |

重新打包真实组件夹具，以 `agent-browser --session tool-result-pr67-baunie` 验证 390px 宽度：简写 `report` 链接的 href 正确，空内容/未知内容错误均显示“工具返回错误”和原文，正常未知内容无错误提示；页面宽度未溢出。见[本轮截图](./result/pr67-review-mobile.png)。未点击外部链接、未操作真实会话。沿用前述夹具字体回退限制。

本轮未重新运行完整生产构建，使用类型检查、集成测试及浏览器组件验证覆盖此次识别逻辑修正；未执行 Git 提交、推送或 GitHub 评论/线程状态操作。

## Claude 完整工具结果支持

2026-10-20，先补齐本需求 TR-07、TR-08 与 Claude 兼容约定，再实现。

- `src/lib/session-parser.ts`：Claude `tool_result` 新增完整 `output`。字符串原样保留，其他 JSON 值完整序列化，缺失内容保持缺省；保留原有摘要、问题回答优先级及状态逻辑。
- 直接复用共享结果识别与展示组件，无新增依赖、协议或重复渲染分支，遵循 KISS、DRY。普通日志/文件正文等宽显示，多文本块支持 Markdown，未知媒体保留 JSON，错误正文完整可见。
- `tests/unit/lib/session-parser-claude.test.ts`：覆盖完整/超长字符串、多文本及未知块、空值、错误、摘要与问题/任务/计划兼容、初始/历史/增量读取及子 Agent。
- `tests/unit/lib/tool-result-content.test.ts`：真实 Claude JSONL 解析后经 JSON 序列化，再交给 `ToolCallItem`，验证完整正文、安全 Markdown、未知块、错误和成功 Edit diff 行为。

本轮实际验证：

| 检查 | 结果 |
| --- | --- |
| 修改生产源码前运行解析与组件回归 | 12 项通过、16 项失败，复现缺失完整 output |
| `pnpm exec vitest run tests/unit/lib/session-parser-claude.test.ts tests/unit/lib/tool-result-content.test.ts tests/unit/lib/tool-result-presentation.test.ts tests/unit/lib/timeline-turn-pagination.test.ts tests/unit/lib/timeline-tasks.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/codex-jsonl-parser.test.ts` | 7 个文件共 124 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/session-parser.ts tests/unit/lib/session-parser-claude.test.ts tests/unit/lib/tool-result-content.test.ts` | 通过，无警告 |
| `git diff --check` | 通过 |

使用 `agent-browser --session claude-results-baunie` 验证本地隔离夹具：Node 调用真实 Claude 解析器生成结果并序列化，浏览器使用真实 `ToolResultContent`、NextIntl 和项目样式渲染。1280px 桌面与 390px 窄屏均无页面横向溢出（scrollWidth 分别为 1280px、375px）；完整文件末行、MCP 链接/标题/列表/表格/未知块、错误正文及错误颜色正确，原文可展开。未生成图片元素，无 JavaScript 运行错误。截图见[Claude 桌面](./result/claude-desktop.png)、[Claude 窄屏原文](./result/claude-mobile-raw.png)。

TR-07、TR-08 的解析/传输序列化/组件与兼容回归通过。本轮未重新执行生产构建，采用完整类型检查与浏览器组件验证；未验证真实会话 WebSocket 重连、完整应用导航或物理手机。夹具字体及 favicon 请求 404，沿用系统字体回退限制。旧缓存中的摘要需重新解析原始 JSONL 才能补全正文，不能恢复原始日志未记录的内容。未执行 Git 提交、推送或发布。

## Claude 评审修正：语义、传输与资源边界

2026-10-20，根据用户的九项评审先调整本需求第 9～15 条及 TR-09～TR-11，再修改实现。以下结果替代上一轮“任意大小正文完整进入时间线”的实现结论；原 JSONL 不变，UI 改为有明确省略提示的有界预览。

| 评审项 | 修正与证据 |
| --- | --- |
| 1：字符串被 JSON 识别器改写 | Claude 新增可选 outputFormat，字符串标记 text 并绕过识别；JSON 形状的命令、MCP 对象和数组经解析/序列化/真实组件后保持等宽原文，不制造错误。未标记的既有 Codex 结果沿用识别规则 |
| 2：背压静默丢增量 | 新增按连接拥有的 timeline-delivery 有界顺序队列，50ms 重试；4 MiB/256 条/10 秒边界触发 1013 关闭，交由既有重连 init 恢复。初始、增量、补读与统计共用发送入口，订阅切换和关闭释放队列；补读失败也主动恢复。真实文件监听测试证明 offset 已推进后、无新文件事件也能补发 2 MiB 原结果的预览 |
| 3：深层 JSON 栈溢出 | claude-tool-output 在 stringify 前限定 32 层、2,048 节点及字符预算。6,000 层合法 JSON 经初始/按轮/增量解析与后续传输序列化均通过，增量游标正常推进 |
| 4：媒体与正文资源无界 | Claude output 最多 65,536 UTF-16 单元，不拆代理对；base64 data/blob 替换为省略标记，保留元数据和周边文本。设置 outputTruncated，11 种语言均提供说明；超界 JSON 前缀按 text 展示。原文 pre 只在展开时挂载，收起释放 |
| 5：快照丢弃与整轮 stringify | WeakMap 复用不可变对象的保守大小估算，不序列化整轮。超限先移除工具正文，保留摘要和最终状态；仍超界保留最新可容纳后缀，无可用新预览则保留旧快照原 TTL。回归覆盖 3 MiB 结果、子 Agent、10,000 条长轮次及重复追加估算复用 |
| 6：回扫重复生成结果 | readClaudeTurn 边界判定只检查用户消息及协议语义，不调用 parseContent 生成工具结果；spy 验证每页工具内容仅转换一次。退出命令、任务通知、协议文本及中断不误判为新轮次 |
| 7：缺失属性契约 | content 缺失时返回空字段对象，服务端结果没有自有 output 属性；测试使用严格 not.toHaveProperty，同时覆盖 null、false、0 与空字符串 |
| 8：测试夹具重复 | tests/helpers/timeline-fixtures.ts 共享 Claude 调用/结果/用户行、JSONL 编码、临时文件创建和清理，解析、组件、分页及服务端测试复用 |
| 9：大结果跨块缺少回归 | UTF-8 正文超过 64 KiB、含 emoji，并覆盖多文本块、不完整末行及字节中途追加。验证内容逐字一致、历史边界无重叠、readOffset/newOffset 正确 |

实现遵循职责分离：解析器只接入有界转换，组件依据类型展示；每连接发送器管理背压，缓存单独处理展示预算。共享工具渲染和测试夹具继续复用，无新增依赖。

本轮最终自动化检查：

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/session-parser-claude.test.ts tests/unit/lib/tool-result-content.test.ts tests/unit/lib/tool-result-presentation.test.ts tests/unit/lib/timeline-turn-pagination.test.ts tests/unit/lib/timeline-tasks.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/codex-jsonl-parser.test.ts tests/unit/lib/timeline-delivery.test.ts tests/unit/lib/timeline-display-cache.test.ts tests/unit/lib/timeline-display-hook.test.ts tests/unit/lib/timeline-server-initial-delivery.test.ts tests/unit/lib/timeline-initial-delivery.test.ts` | 12 个文件，166 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过（最终构建后再次执行） |
| `pnpm exec eslint src/lib/claude-tool-output.ts src/lib/session-parser.ts src/lib/timeline-delivery.ts src/lib/timeline-server.ts src/lib/timeline-display-cache.ts src/components/features/timeline/tool-result-content.tsx src/types/timeline.ts tests/helpers/timeline-fixtures.ts tests/unit/lib/session-parser-claude.test.ts tests/unit/lib/tool-result-content.test.ts tests/unit/lib/timeline-turn-pagination.test.ts tests/unit/lib/timeline-delivery.test.ts tests/unit/lib/timeline-display-cache.test.ts tests/unit/lib/timeline-server-initial-delivery.test.ts` | 通过，无警告 |
| `pnpm build` | Next.js 类型检查、Turbopack 编译、24 个静态页面、post-build 与 tsup 全部通过 |
| 本地化 JSON 与新增键检查、`git diff --check` | 通过 |

首次 ESLint 将名为 useJsonlFixture 的测试工厂识别成 React Hook；已改为 createJsonlFixture 并重新通过检查。

浏览器使用真实解析器生成 JSON，再交给真实共享组件及项目样式，命名会话 claude-review-baunie。1280px/390px 视口的 document.scrollWidth 分别为 1265px/375px，无横向溢出。65,536 单元预览容器外高 320px；2 MiB base64 所在混合结果的可见未知 JSON 仅 86 字符，展开的整个结果预览 217 字符。折叠时 raw pre 数量为 0，鼠标和 Enter 可展开/收起，收起后 pre 不存在；无图片元素、无 JavaScript 运行错误。JSON 文件中的 exit_code:1 仍显示为普通文本，真实 is_error 的错误正文保留错误颜色。

截图：[桌面视口](./result/claude-review-desktop.png)、[窄屏原文与长文本](./result/claude-review-mobile.png)、[窄屏媒体省略与展开](./result/claude-review-mobile-raw.png)。最初整页截图遇到 CDP captureScreenshot 超时，随后命令也超时；关闭该验证会话后重开，改为视口截图及 DOM 断言成功。未认定该超时的具体原因，也未据此声称真实手机性能达标。字体/favicon 仍为夹具 404，使用系统字体回退。背压通过可控 socket 与真实文件监听回归验证，未测真实弱网；未执行真实会话端到端重连或物理手机验收。未提交、推送或发布。

## PR #73：恢复确认被队列清理删除

2026-10-20，读取 [review 5576259188 的 P2 意见](https://github.com/stirp/purplemux-improved/pull/73#discussion_r4317631347)，确认本地与 PR head 均为 `92075fc72e7d9f84db7cd96a4bb066187a492581`。按本需求补齐第 16 条与 TR-12 后修复。

- `src/lib/timeline-server.ts`：恢复已定位到 JSONL 时，将旧订阅取消及队列清理移至发送 `timeline:resume-started` 之前。新确认随后与新会话 init 顺序发送，避免背压时确认被误删、面板恢复控件持续加载。仅调整既有操作顺序，复用发送队列与初始化逻辑，无新增接口、状态或依赖（KISS、DRY）。
- `tests/unit/lib/timeline-server-initial-delivery.test.ts`：通过真实连接消息处理及 JSONL 初始化路径，参数化验证有/无背压。背压用例让旧 init 留在队列，恢复完成后解除背压，严格断言只收到一次 resume-started、随后一次新 init，且新正文属于目标会话。
- 修改生产源码前运行新增测试：5 项通过、1 项失败，失败明确显示只收到 timeline:init、缺少 timeline:resume-started，复现评审问题。

本轮实际验证：

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/timeline-server-initial-delivery.test.ts tests/unit/lib/timeline-delivery.test.ts tests/unit/lib/timeline-initial-delivery.test.ts tests/unit/lib/timeline-display-hook.test.ts` | 4 个文件，26 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/timeline-server.ts tests/unit/lib/timeline-server-initial-delivery.test.ts` | 通过，无警告 |
| `pnpm exec tsup` | 服务端生产构建通过 |
| `git diff --check` | 通过 |

本轮仅修正服务端发送顺序，未重新执行 Next.js 前端构建或浏览器验证；背压由可控 socket 模拟，未验证真实弱网与实机恢复交互。没有 Git 提交、推送或修改 GitHub 评论/线程状态。
