# 实施与验证

## 结论与证据边界

两张截图展示了一条仍在队列中的待确认消息，以及一条多出“确定”前缀的原生消息。服务端 `createCodexInputReceipt` 与前端 `useTimeline` 都调用严格的 `matchesInputMessage`；正文不同会同时造成未确认队列及两个气泡。单纯移除前端占位不能解决后端队列停滞。

源码存在确定性缺口：原 `isCodexTuiReadyContent` 接受带已有文本的输入框，随后 `pasteText` 会追加内容。可控测试覆盖此路径；没有取得截图所对应会话的原生日志，也未复现“确定”最初如何进入输入框。用户已明确只使用 Web 输入框，本记录不将额外内容归因于手动 Terminal 操作，也不宣称全部现场根因已查明。

## 实施

- `src/lib/codex-input-state.ts`：结合保留 SGR 的终端快照与光标位置识别空输入框。暗色占位文字不算正文；RGB/索引色参数不误作暗色属性；已有文字、已覆盖的附件/粘贴标记及多行输入形态阻止投递。
- `src/lib/tmux.ts`：既有快照函数增加可选转义序列参数，默认行为不变；新增只读光标查询，读取失败返回 null。
- `src/lib/input-queue-server.ts`：在写入前检查，存在正文返回 `terminalHasDraft`，无法识别返回既有 `terminalNotReady`。记录消息 ID、会话 ID 及识别状态，不记录正文。迟到回执检查仍先于写入检查。
- `src/lib/input-queue.ts`、`web-input-bar.tsx`、11 个语言资源：传递明确错误并保留待发原文、附件；桌面及移动端共用提示，其他语言沿用现有英文回退惯例。
- 复用既有队列串行、重试及严格回执规则，不引入相似文本去重、自动清空终端或自动重发。检测逻辑与投递/显示职责分离，没有新增依赖或配置（KISS、DRY、单一职责）。

## 自动化验证（2026-10-24 本次运行）

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

## 限制与未完成的现场核实

- 本次代码修复是防止可验证的追加拼接路径；截图中额外前缀的最初来源仍待对应现场的终端/原生记录取证。
- 没有在用户运行中的会话发送测试消息，未操作截图中的历史队列，也未进行浏览器或另一台设备的实机验收。已有拼接记录仍按严格规则保留未确认状态；不将包含原文当成自动成功依据。
- 输入框识别依赖 Codex 当前的提示符、暗色占位和光标约定；CLI 改变渲染或无法读取时会保留消息而非盲目发送。终端快照与光标是两次只读查询，外部客户端同时改动终端仍存在竞争窗口。
- 未提交、推送或部署；依赖复用主工作区的 `node_modules` 软链接。
