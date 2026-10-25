# 实施与验证

## 结论与证据边界

两张截图展示了一条仍在队列中的待确认消息，以及一条多出“确定”前缀的原生消息。服务端 `createCodexInputReceipt` 与前端 `useTimeline` 都调用严格的 `matchesInputMessage`；正文不同会同时造成未确认队列及两个气泡。单纯移除前端占位不能解决后端队列停滞。

源码存在确定性缺口：原 `isCodexTuiReadyContent` 接受带已有文本的输入框，随后 `pasteText` 会追加内容。首轮可控测试覆盖此路径。后续根据用户“Chat 输入进入隐藏 TUI”的定位，发现并修复了连接/重连自动聚焦隐藏终端、隐藏终端仍接受输入的上游路径，详见下文。没有取得截图对应会话的原生日志或重演当时设备的完整过程；本记录不将额外内容归因于用户手动 Terminal 操作。

## 实施

- `src/lib/codex-input-state.ts`：结合保留 SGR 的终端快照与光标位置识别空输入框。暗色占位文字不算正文；RGB/索引色参数不误作暗色属性；已有文字、已覆盖的附件/粘贴标记及多行输入形态阻止投递。
- `src/lib/tmux.ts`：既有快照函数增加可选转义序列参数，默认行为不变；新增只读光标查询，读取失败返回 null。
- `src/lib/input-queue-server.ts`：在写入前检查，存在正文返回 `terminalHasDraft`，无法识别返回既有 `terminalNotReady`。记录消息 ID、会话 ID 及识别状态，不记录正文。迟到回执检查仍先于写入检查。
- `src/lib/input-queue.ts`、`web-input-bar.tsx`、11 个语言资源：传递明确错误并保留待发原文、附件；桌面及移动端共用提示，其他语言沿用现有英文回退惯例。
- 复用既有队列串行、重试及严格回执规则，不引入相似文本去重、自动清空终端或自动重发。检测逻辑与投递/显示职责分离，没有新增依赖或配置（KISS、DRY、单一职责）。

## 首轮自动化验证（2026-10-24）

| 检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/codex-input-state.test.ts tests/unit/lib/input-queue-server.test.ts tests/unit/lib/codex-input-receipt.test.ts tests/unit/lib/input-message-match.test.ts tests/unit/lib/timeline-display-hook.test.ts tests/unit/lib/input-queue.test.ts tests/unit/lib/queued-message-display.test.ts` | 7 个文件、85 项通过 |
| `pnpm exec vitest run tests/unit/lib/native-command-input.test.ts tests/unit/lib/codex-tui-ready-detector.test.ts tests/unit/lib/tmux-paste.test.ts tests/unit/lib/input-queue-api.test.ts` | 4 个文件、61 项通过；两组共 146 项 |
| 增加诊断日志后重跑 `input-queue-server.test.ts` | 13 项通过，不重复计入总数 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint` + 本次改动的 TS/TSX 文件列表 | 通过；新增 UI 用例和最后的服务端日志修改也分别检查通过 |
| 11 个 `messages/*/terminal.json` 解析及新增键检查 | 通过 |
| `pnpm exec next build --webpack` | 失败：类型检查、编译成功；`/tools-required` 页面数据收集报 `ReferenceError: self is not defined`。首次输出被命令包装器压缩，使用 `rtk proxy pnpm exec next build --webpack` 重跑取得完整错误；不能标记完整构建通过。软链接依赖环境采用 Webpack |
| `pnpm build:server` | 通过，生成 `dist/server.js` |
| `git diff --check`、本需求 Markdown 链接及 depends_on 目标检查 | 通过 |

## 验收映射

1. 空输入及真实样式的随机占位提示：`codex-input-state.test.ts`；另只读采集当前本地 Codex 的真实快照和光标，返回 `empty`，未注入文字或按键。
2. 带“确定”的输入框：服务端集成测试确认首条及后续条目保留、60 秒不自动投递、没有 paste/Enter/清空调用；检测器覆盖光标移到开头、RGB 参数、附件/粘贴标记和多行形态。
3. 清理后重试：同一测试中模拟终端变空，仅粘贴原文一次并发送 Enter；迟到回执优先检查独立用例通过。
4. 未就绪及原匹配边界：缺失光标、弹窗、禁用、旧同文、附件身份及会话切换回归通过。
5. 严格匹配与合并：额外前缀不确认；既有时间线乱序、重连、图片、同文消息用例通过。桌面/移动组件测试确认提示、保留原文、不自行重试或取消。

## 首轮限制与未完成的现场核实

- 本次代码修复是防止可验证的追加拼接路径；截图中额外前缀的最初来源仍待对应现场的终端/原生记录取证。
- 没有在用户运行中的会话发送测试消息，未操作截图中的历史队列，也未进行浏览器或另一台设备的实机验收。已有拼接记录仍按严格规则保留未确认状态；不将包含原文当成自动成功依据。
- 输入框识别依赖 Codex 当前的提示符、暗色占位和光标约定；CLI 改变渲染或无法读取时会保留消息而非盲目发送。终端快照与光标是两次只读查询，外部客户端同时改动终端仍存在竞争窗口。
- 未提交、推送或部署；依赖复用主工作区的 `node_modules` 软链接。

## 隐藏终端焦点修正（2026-10-24 后续验证）

### 定位与实施

`PaneContainer` 的 WebSocket `onConnected` 原先仅检查 pane 是否激活就调用终端 focus，没有检查终端可见性，也没有保护 Web 输入框当前焦点。桌面零高度终端和移动透明后台终端仍挂载，其 textarea 原先可聚焦、可输入。修复前新增隔离用例为 3 项失败、1 项通过，可控复现了隐藏终端接受 focus、输入和自定义按键的缺口。

- `src/hooks/use-terminal.ts`：集中处理 `inputEnabled`，隐藏时设置 xterm `disableStdin`、移出 Tab 顺序并释放已有焦点；阻止自动/延迟 focus、自定义按键和迟到的 onData，保留输出解析、标题、尺寸和解析回调。
- `pane-container.tsx`、`mobile-surface-view.tsx`、`terminal-container.tsx`：按实际可见性传入输入开关并设置 `inert`；重连不抢已有控件焦点。普通终端和主动打开的原生菜单仍允许交互。
- `src/hooks/use-native-commands.ts`：将首次聚焦移到可见 DOM 提交之后；既有发送及关闭语义、延迟布局聚焦和定时器清理继续保留。
- 聚焦与输入边界集中在现有 hook，桌面和移动端复用，不新增依赖或配置；可见性与后台输出生命周期分离（KISS、DRY、单一职责）。参考 [VSCode TerminalInstance](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts) 的 `focus`、`focusWhenReady`、`setVisible` 职责分离。

### 自动化与浏览器验证

| 检查 | 本轮结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/terminal-surface-input.test.ts tests/unit/lib/terminal-input-isolation.test.ts tests/unit/lib/native-command-input.test.ts tests/unit/lib/terminal-websocket-flow.test.ts tests/unit/lib/terminal-typography-hook.test.ts tests/unit/lib/native-command-completion.test.ts` | 6 个文件、92 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint`：5 个修改的源码文件、上述两个新增隔离测试、`terminal-websocket-flow.test.ts` 及浏览器夹具 | 通过，无错误或警告 |
| esbuild 打包 `tests/fixtures/terminal-input-isolation.tsx` | 通过；真实 React、useTerminal、useNativeCommands、TerminalContainer 和 xterm，next-intl 使用固定翻译 stub |
| agent-browser 独立会话 `input-focus-ws3uei7f`，本地隔离 HTTP 夹具，390 × 844 视口 | 桌面折叠布局及移动透明布局验证通过；未连接用户 PTY |
| `git diff --check`、本需求 Markdown 链接及 depends_on 检查 | 通过 |

浏览器逐项结果：

1. 桌面隐藏终端时，在 Web 输入“确定”，触发延迟终端 focus 后继续输入“严重：完整消息”，Web 保留完整文字，终端输入记录为空；Tab 跳到下一控件。
2. 切到移动隐藏布局后，再触发延迟 focus、追加“，移动端”，Web 草稿完整，终端记录仍为空，容器保持 inert。
3. 主动打开 `$` 菜单后，真实 xterm 获得焦点并收到 `$skill-test`；返回 Chat 后 Web 恢复焦点，等待超过 180ms 延迟回调窗口仍未被抢走。关闭时既有 Ctrl-E/Ctrl-U 清理指令按原语义保留。
4. 隐藏时写入 `NEW OUTPUT`，展开后输出仍可见；可见终端正常发送 `visible-input`，再次收起后不持有焦点，textarea 为 readOnly 且 tabIndex=-1。

验收 7 对应桌面/移动父组件接线测试及真实浏览器焦点/Tab 测试；验收 8 对应 hook 的隐藏、IME 229、粘贴/迟到 onData、输出/解析/标题测试；验收 9 对应原生命令回归、可见终端恢复测试及浏览器主动展开/关闭流程。显式 Web/命令发送仍通过原 WebSocket 通道，输入开关仅限制 xterm 的交互输入。

### 本轮边界

- 浏览器使用真实 xterm 的隔离夹具，中文通过浏览器文本插入验证；没有运行操作系统中文输入法候选交互，也未对用户设备或原会话做端到端验收。
- 连接回调通过父组件集成测试触发，浏览器夹具验证真实 DOM 焦点和输入行为；未在用户连接上制造断网重连或发送测试消息。
- 本轮按 UI 影响执行浏览器验证，没有重跑生产构建；首轮 `/tools-required` 的 `self is not defined` 完整构建失败仍未解决，不能标记完整构建通过。
- 首轮输入框残留检测继续保留。已发生的拼接消息、历史及未确认队列没有被自动修改；未提交、推送或部署。

## PR #88 多行草稿漏检修正（2026-10-24）

### 审查与实施

[审查意见](https://github.com/stirp/purplemux-improved/pull/88#discussion_r4367095297) 对应提交 `d14cfb935e04471a4b87544f1f62de832683d82f`。本轮读取 PR 时只有这一条代码审查意见，远程 CI `check` 已通过。

原 `readCodexInputState` 只检查提示符行及其下一行。`› \n\n  existing draft\n\n  GPT-6 · Full Access\n  ? for shortcuts` 配合起始光标 `{ x: 2, y: 0 }` 会错误返回 `empty`，允许队列追加正文。先补充验收 10 及回归用例，旧实现运行结果为 28 项通过、10 项失败，包含审查原样快照及队列误发送复现。

`src/lib/codex-input-state.ts` 改为先跳过屏幕末尾填充空行，再从底部连续状态区向上寻找分隔行；空输入框仅有提示符行和一个分隔空行，出现额外输入行即返回 `occupied`，包括只有空白的续行。不会在草稿第一个空行处停止，不依赖模型名称或自定义状态正文。保留已有就绪、光标、占位样式和附件检查，复用队列已有 `terminalHasDraft` 处理，无新增依赖或重复投递逻辑（KISS、DRY、单一职责）。

布局依据还核对了 [Codex composer_layout.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/chat_composer/composer_layout.rs) 的 textarea 底部一行留白及 footer 布局；本实现仍依赖当前终端布局，不新增 CLI 版本兼容承诺。

### 本轮验证

| 检查 | 结果 |
| --- | --- |
| 修改前 `pnpm exec vitest run tests/unit/lib/codex-input-state.test.ts tests/unit/lib/input-queue-server.test.ts` | 28 通过、10 失败，确认回归测试捕获原缺陷 |
| 修改后 `pnpm exec vitest run tests/unit/lib/codex-input-state.test.ts tests/unit/lib/input-queue-server.test.ts tests/unit/lib/codex-tui-ready-detector.test.ts tests/unit/lib/input-queue.test.ts tests/unit/lib/codex-input-receipt.test.ts tests/unit/lib/tmux-paste.test.ts` | 6 个文件、81 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/codex-input-state.ts tests/unit/lib/codex-input-state.test.ts tests/unit/lib/input-queue-server.test.ts` | 通过，无错误或警告 |
| `pnpm build:server` | 通过，生成 `dist/server.js` |

验收 10 映射：检测器覆盖审查原样快照、多重前置空行、空白行、尾部空行、暗色附件、正文中的快捷键提示文字、仅空续行及屏幕填充；正常空输入保留单行/多行自定义 footer、有无快捷键提示等兼容用例。服务端测试覆盖错误码、首条和后续消息原文及附件保留、60 秒不粘贴或发送 Enter，以及清空后显式重试只投递一次。

本轮仅修改服务端输入区检测及测试，无新增 UI 行为，未重跑浏览器验收或完整 Next 构建；此前完整构建的 `/tools-required` 错误仍按原记录保留。没有操作用户运行会话，没有提交、推送、回复或解决远程审查线程；工作区保留上一轮隐藏终端输入修复。
