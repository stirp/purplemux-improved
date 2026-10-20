# Codex 输入停滞排查记录

当前已按后续授权进入修复；前面的诊断与建议保留为当时证据，最终实施与验收见文末。

## 结论与源码依据

已确认一个能解释用户现象的队列缺陷：终端写入完成被当作消息投递完成，原消息移出队列，但后续调度等待执行状态事件；如果没有事件，等待没有期限且不向界面展示原因。

1. `src/components/features/workspace/web-input-bar.tsx` 的 `dispatch` 在入队请求成功后清除草稿，入队成功不代表 Codex 已接收。
2. `src/lib/input-queue-server.ts` 仅检查 tmux session 存在，粘贴文本后等待 250ms，再发送 Enter。Codex 路径没有检查输入框就绪、消息进入会话或 prompt-submit 确认。
3. `src/lib/input-queue.ts` 的 `flush` 在 `deliver` resolve 后立即移除原消息并设置 `waiting`。这里的成功只证明 tmux 命令没有报错。
4. `waiting` 只有在空闲状态下，且曾观察到 busy 或 eventSeq 增大时才清除。没有期限，也没有未确认告警；只要它存在，后续普通消息就不会自动发出。
5. `snapshot` 只返回 messages/sending/error，不返回 waiting。界面因此可能同时展示空闲状态和“排队中”，没有解释实际阻塞原因。
6. `src/hooks/use-web-input.ts` 根据 cliState 的 busy/needs-input 选择停止模式；输入栏还要求草稿及附件为空才展示红色停止按钮。缺少停止按钮本身不能单独证明 Agent 没执行。

## 本次验证

### 既有自动化测试

执行：

```bash
pnpm exec vitest run tests/unit/lib/input-queue.test.ts tests/unit/lib/input-queue-server.test.ts tests/unit/lib/input-queue-api.test.ts tests/unit/lib/tmux-paste.test.ts
```

结果：27 项通过，0 项失败。现有测试覆盖忙闲顺序、显式投递失败、立即提交等，但没有验证无接收确认时的超时反馈或恢复。

### 可控状态机复现

使用 `pnpm exec tsx -e` 导入仓库的真实 `InputQueue`，不修改源码：

- status 固定为 idle、eventSeq=1、相同 workspace/provider/session。
- deliver 使用 resolve 的替身，只记录调用消息 ID；这模拟 tmux 写入成功，没有模拟真实 Codex 接收。
- 入队 first 后执行一次 tick；随后入队 second，再执行 10,000 次 tick。

实测结果：

| 阶段 | 可见消息 | sending | error | hasPendingInput | deliver 调用 |
| --- | --- | --- | --- | --- | --- |
| first 写入完成 | 空 | false | null | true | first |
| second 入队后 10,000 次调度 | second | false | null | true | 仍仅 first |

cliState 全程 idle。10,000 次调度是快速模拟，不是实际等待 5,000 秒；没有真实 Codex 或浏览器端到端复现。

### 现场只读检查

- 通过本地 CLI API 查询当前 6 个 Codex 标签的状态与队列，全部 messages 为空、sending=false、error=null；未定位到仍有可见积压的故障标签。
- 当前排查会话状态为 busy，说明当前会话的执行状态链路正常；不能据此排除其他时刻事件丢失。
- GET 队列接口不暴露 waiting，因此 messages 为空不能排除内部仍在等待。
- 查看当日应用日志，现有信息不足以把首条输入与具体一次终端投递、Codex 接收事件关联。没有依据把已有推送通知错误判定为本次故障原因。
- 已询问故障工作区/标签及大致时间；记录时尚未获得现场定位信息。

## 未确认事项与修复方向

首次没有确认的具体触发因素尚未确定：TUI 就绪/焦点/粘贴处理或提示框导致 Enter 未提交，以及状态事件漏报，均需故障时终端、会话 JSONL 和事件日志区分。固定 250ms 延迟并不构成接收确认，但目前不能断言故障就是延迟不足。

建议后续将“已写入终端”“已被当前会话接收”“本轮完成”分开处理；未确认时保留消息、暴露等待原因及超时后的人工恢复入口，并补充带 tab/session/message ID 的投递日志。避免盲目重发正文或仅延长固定延迟，以防终端残留草稿与下一条拼接或产生重复任务。

本轮仅新增诊断文档，未修改应用或测试代码，未执行构建、TypeScript、ESLint、浏览器或实机验收。复用现有队列实现做诊断，避免为排查增加运行时逻辑（KISS/YAGNI）。

## 后续取证：当天发生一次消息丢失，当前未复现

用户补充确认今天发生过一次消息丢失，目前没有复现。当前队列为空不能作为消息送达的证明；前述模拟只证明未确认路径存在缺陷，尚不能确定当天实际故障就是该路径。

### 历史对账

通过 Python 只读对账：

1. 读取 `~/.purplemux/workspaces/*/message-history.json`，筛选北京时间 2026-10-20 00:00 起的 `sentAt`。
2. 在 `~/.codex/sessions` 及 `~/.codex/archived_sessions` 枚举当天修改的 JSONL，覆盖之前创建但当天继续使用的会话。
3. 仅提取 `event_msg/user_message` 与 `response_item` 中 role=user 的正文，不匹配工具输出或 assistant 文本。
4. 将输入历史正文与原生用户消息做完整正文包含匹配，核对命中的会话 cwd 与工作区目录。

本次读取 9 个 JSONL，提取 61 条用户消息记录；当天现存 19 条输入历史均匹配到对应工作目录的原生会话用户消息，其中包括本次排查对话。没有从这些现存历史中找到“正文从未进入 Codex”的候选消息。

### 证据限制

- `src/lib/message-history-store.ts` 的 `addMessageHistory` 按完全相同正文去重：移除旧记录并写入新 ID、sentAt。因此第一次发送失败后重发成功，会掩盖第一次发送的时间与次数。
- 历史记录只有工作区、正文与时间，没有 tab/session/queue-message ID 及接收结果；它是复用输入的历史，不是投递审计账本。
- 历史最多 500 条，可由用户删除；以 `/` 开头的输入与纯附件不保存正文历史。历史保存请求失败也不影响入队操作。
- 队列保存在进程内存中，服务重启不会恢复它；这也是当前无积压不能证明过去送达的原因之一，但本次没有证据将重启与故障时间关联。
- 因此 19 条均匹配只说明这些留存正文最终出现在会话里，不能证明每一次发送都成功，也不能排除没有留存历史的输入。

本轮未再次运行既有测试，因为没有修改应用代码；文档链接、空白和差异格式检查通过。进一步定位需要丢失消息的关键词或所在工作区；已询问，记录时尚未得到信息。

## 发送到上屏延迟取证

### 当天样本

本轮查询时，当天输入历史增加至 21 条。以输入历史 sentAt 到原生 `response_item` 用户正文时间戳计算，最短 10.481 秒、中位数 11.203 秒、最长 285.917 秒；多数约 10–12 秒，另有 15–17 秒样本。最长样本是否包含忙碌排队没有在本轮核验，不能作为常规投递耗时。这个指标不包含浏览器点击到历史写入、JSONL 写入后的 WebSocket 传输与绘制耗时。

### 当前追问的完整可观测时序

工作区 `ws-AKCTYz`，会话 `01a15850-e247-7073-bcae-9c1a73f8ed66`，turn `01a158ea-ab28-75b3-b1e4-673963d0fa09`。以下均为北京时间 2026-10-20：

| 时间 | 相对输入历史时间 | 证据 |
| --- | --- | --- |
| 18:45:36.063 | 0 | message-history.json 的 sentAt |
| 18:45:36.681 | 0.618 秒 | Codex 日志收到 turn_input |
| 18:45:36.703 | 0.640 秒 | 原生 JSONL task_started |
| 18:45:41.722 | 5.659 秒 | 当前 turn 的远程插件推荐请求失败告警 |
| 18:45:41.730 | 5.667 秒 | world_state.build 开始上下文构建 |
| 18:45:46.741 | 10.678 秒 | 原生 JSONL turn_context |
| 18:45:46.755–47.010 | 10.692–10.947 秒 | 技能候选选择实验日志，catalog_entries=92 |
| 18:45:47.266 | 11.203 秒 | 原生 response_item 用户消息 |
| 18:45:47.274 | 11.211 秒 | item_completed/UserMessage，供时间线解析 |

日志通过 SQLite `mode=ro` 读取 `~/.codex/logs_2.sqlite` 的 logs 表，按时间与 thread_id/turn_id 关联。远程请求告警位于当前 turn 的 `step_context.capture → prepare_tool_recommendations → recommended_plugins_mode_for_config`，目标为 `https://chatgpt.com/backend-api/ps/plugins/suggested/codex?scope=GLOBAL`。当前 turn 的后续步骤也反复出现相同失败；不能把其他后台 analytics 请求的超时与它混为一谈。

已确认主要延迟发生在 Codex 已接受本轮之后、写入用户消息之前。前约 5 秒对应远程推荐请求失败返回；随后约 5 秒处于上下文准备区间，现有日志未提供足够的内部开始/结束信息，不能将全部 10 秒都归因于同一个插件请求，也没有证据证明是提交 Hook 超时。

### 应用侧路径

- 服务端队列每 500ms 调度一次，粘贴后固定等待 250ms；这能解释当前约 0.64 秒的投递窗口，无法解释后续约 10.5 秒。
- 时间线文件监听 debounce 为 50ms，增量记录在统计计算之前通过 WebSocket 发送。50ms 是源码参数，不是本轮浏览器实测延迟。
- `web-input-bar.tsx` 的普通 `dispatch` 只入队并清空草稿，没有调用父面板传入的 `onAddPendingMessage`；该属性甚至未被解构使用。`onOptimisticSend` 仅连到 `useWebInput.send`，普通队列提交不经过该路径。
- 因此普通输入必须等原生记录才能出现在聊天区。页面已有 pending 消息能力，但没有接入当前普通发送路径。
- `useTimeline.addPendingUserMessage` 默认在 busy 后约 1 秒启动淡出；简单接回旧默认行为仍可能出现“先出现又消失”，需要为正常发送保留待确认消息直至真实确认或明确失败。

### 连贯性建议（尚未实现）

1. 用户点击发送立即在聊天区显示同一条消息，附带“发送中”；入队成功后显示“排队中”或“等待会话确认”，不要把入队或 tmux 写入成功标记为已送达。
2. 后端保留消息 ID、正文与投递阶段；真实会话记录匹配后原位确认，避免重复气泡、重连丢失或凭任意事件误确认。
3. 请求失败保留正文并显示失败；确认超时保留“尚未确认”及恢复入口，禁止盲目自动重发。队列取消、附件、同正文重复输入、会话切换均需在实施前明确验收。
4. 真实耗时另行处理：查明 Codex 远程推荐请求的网络失败；若不需要推荐能力，应先核实当前版本支持的独立配置，再评估关闭推荐，不直接关闭所有插件或技能。本次没有修改 Codex 配置，也没有验证任何具体开关。
5. 补齐点击、入队、写入、接收、页面确认各阶段的诊断时间，才能区分网络、排队、CLI 准备和显示延迟。

本轮完成日志时序取证与源码检查，未修改应用、执行新测试或采集浏览器绘制时刻。建议是设计方案，尚未成为已实现功能。

## 最终实施：真实回执与即时待确认消息

### 实施范围

- [input-queue-server.ts](../../../../src/lib/input-queue-server.ts) 和 [codex-input-receipt.ts](../../../../src/lib/codex-input-receipt.ts)：Codex 普通队列投递前排除 shell/未知前台进程并检查 TUI 输入区域；复用原生解析器读取当前会话的新用户记录，正文及附件身份匹配才完成投递。在 Enter 前再次检查会话与回执，避免切换后提交或已经手动提交后重复按键。
- [input-queue.ts](../../../../src/lib/input-queue.ts)：投递尝试保留开始时间、原消息及附件；30 秒没有确认时显式报告 `deliveryUnconfirmed`，不自动重发。每 5 秒只读检查迟到回执，确认后解除阻塞；显式立即发送也先查回执。取消失败项后不将其尝试时间用于下一条同文消息，也不会自动把后续消息拼接到残留终端草稿。
- [web-input-bar.tsx](../../../../src/components/features/workspace/web-input-bar.tsx) 和 [use-timeline.ts](../../../../src/hooks/use-timeline.ts)：普通提交在网络请求完成前就创建有稳定 ID 的待确认气泡，保留发送中/排队中/未确认/失败反馈。请求失败保留草稿，取消同步删除占位；原生消息到来后原位确认，普通队列消息不再自动淡出。
- [input-message-match.ts](../../../../src/lib/input-message-match.ts)：客户端、服务端共用正文、时间和附件身份匹配规则。旧同文记录、其他附件及无关用户消息不能确认当前输入；处理重连后原生记录先于队列快照到达的顺序。
- [user-message-item.tsx](../../../../src/components/features/timeline/user-message-item.tsx)：显示明确投递状态，长时间等待不将新队列气泡淡出；新文案提供简繁中文，其他语言使用英文文案。
- `docs/STATUS.md` 记录投递状态与 Agent 执行状态的区别；`input-queue` 日志记录开始写入、终端写入完成、原生确认、超时及 tab/session/message ID，不记录用户正文。

设计复用既有队列、CodexParser 和 pending 气泡，匹配规则集中维护；没有新增依赖、直接写入 Codex 历史、模拟成功回执或修改用户 Codex 配置（KISS/DRY）。终端写入与原生接收各自负责独立阶段（单一职责）。

### 验收映射

| 条件 | 本次证据 |
| --- | --- |
| 终端写成功但未进入原生会话 | fake timer 推进超过 30 秒，原消息仍在，错误为 deliveryUnconfirmed，后续消息不自动写入 |
| 正常约 11 秒准备期间 | 12 秒仍显示 sending 且保留消息，回执出现后仅移除已确认项 |
| 迟到回执 | 超时后只读检查及显式重试均确认已收到，paste/Enter 调用次数仍各为 1 |
| TUI 未就绪/会话切换 | 不粘贴到不可输入界面；等待期间身份切换不继续 Enter；原文保留 |
| 旧同文、无关正文、分段 JSONL | 临时真实 JSONL 结合原生增量解析器，旧记录和无关事件不确认，分段追加完整新用户记录后才确认 |
| 附件匹配 | 正文和上传图片路径均匹配才确认；PDF 等普通文件按原生路径正文匹配，兼容路径转义；其他文件不能消耗占位；纯附件 init 原位确认 |
| 立即反馈与失败草稿 | 桌面/移动模式 DOM 测试：入队 Promise 未完成即调用占位；请求失败撤销对应占位、保留草稿 |
| 长等待、取消和重连顺序 | 60 秒仍保留占位，取消删除对应气泡；旧同文 init 不误确认；原生记录先到不重复；确认后不重新添加 pending |
| 真实气泡状态渲染 | UserMessageItem DOM 测试验证正文、发送中、未确认标记和确认后移除标记；队列气泡不因旧淡出定时器变半透明 |

### 验证命令与结果

```bash
pnpm exec vitest run tests/unit/lib/codex-input-receipt.test.ts tests/unit/lib/input-queue.test.ts tests/unit/lib/input-queue-server.test.ts tests/unit/lib/input-queue-api.test.ts tests/unit/lib/timeline-display-hook.test.ts tests/unit/lib/timeline-display-cache.test.ts tests/unit/lib/native-command-input.test.ts tests/unit/lib/queued-message-display.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/tmux-paste.test.ts tests/unit/lib/idle-tab-reclaimer.test.ts tests/unit/lib/idle-tab-close.test.ts tests/unit/lib/idle-tab-api.test.ts
```

最终结果：140 项通过，0 项失败，覆盖原生回执、队列/API、时间线、DOM 交互、附件及闲置回收保护。

- 使用 `git diff --name-only` 与 `git ls-files --others --exclude-standard` 收集本轮 `.ts/.tsx`，执行 `pnpm exec eslint`：通过。
- `pnpm exec tsc --noEmit`：通过（包含测试文件的完整检查）。
- `pnpm build`：最终构建通过，Next.js 类型检查、生产编译、24 页生成及 tsup 服务端打包成功。构建提示多 lockfile 导致 workspace root 推断警告，本轮未修改工程根目录配置。
- JSON 解析、需求及源码链接、空白检查和 `git diff --check`：最终检查通过。

### 实机与剩余边界

- 未向正在运行的用户 Codex 会话注入测试消息；没有复现“旧草稿出现在 TUI”那次真实操作，因此没有声称找到了其唯一触发因素。当前保护针对已确认的静默丢弃缺陷，真实历史故障需更新运行版本后的现场验收。
- 本次 UI 验证为 jsdom 中的真实 React 组件测试，未执行浏览器/手机实机验收。没有测量更新后实际点击到绘制延迟，只验证占位不等待网络或原生记录。
- 原生 Codex 插件推荐/上下文准备耗时未修改；“假写”改善即时反馈，不伪造已送达或已执行状态。
- 队列仍保存在服务进程内存，重启恢复未实现；立即问题回答和 Claude 终端投递保留既有语义。
- 本次未发布、未重启当前应用，代码改动尚未加载到用户正在使用的版本。

## Review 修正：五条回执与状态问题

本次先补充 spec 验收 8–12，再修复审查反例；此前 140 项通过不代表覆盖这些反例。本节记录重新执行的验证。

| 审查项 | 修复与回归证据 |
| --- | --- |
| P1 仅最新一轮导致迟到回执漏报 | `CodexParser.parseSince` 复用反向 JSONL 读取，从尝试时间边界开始解析并保存增量游标，避免读取整个旧轮次。真实临时 JSONL 中先写迟到原消息和完成事件，再写其他终端输入；新建 checker 仍返回 received/completed。 |
| P2 Claude 图片 base64 匹配失败 | 上传文件和 Claude 原生 base64 解码内容使用 SHA-256 标识；API 在服务端计算，不接受客户端伪造摘要。匹配器按附件逐个消费身份，拒绝不同图片及错误附件数量。真实 Claude parser 输出验证匹配；Hook 覆盖摘要快照先到/后到，均只保留一个已确认气泡。 |
| P2 重连复用同一回执 | init 优先恢复已确认记录与 queue ID 的对应关系，以原生时间、正文、图片识别重解析记录；再匹配剩余 pending。真实 Hook 入队两条同文，第一条确认后模拟带新解析 ID 的 init 和队列轮询，第二条仍 pending，收到第二条新记录才确认。 |
| P2 其他客户端取消残留占位 | `canceledIds` 与成功出队分开，独立于空队列保留，Tab 消失时清理；不把取消记录视为待执行工作。队列测试覆盖空队列及后续成功发送，DOM 测试模拟另一端取消，验证仅删除取消项、不删除等待原生记录的成功出队项。 |
| P2 超过 30 天的会话无法确认 | StatusManager 提供服务端绑定路径访问器；checker 用原生 session_meta 核实身份后读取，无法获得绑定文件时才回退日期扫描。真实文件用 90 天前的 session_meta 和当前消息，禁用搜索回退仍能确认；绑定其他会话文件时明确拒绝。 |

复用原有解析器、队列、上传存储及 Hook；附件身份匹配统一维护，未新增依赖。取消结果只保留 ID，不保存重复正文，队列与取消记录均延续服务进程内存生命周期。图片按实际字节匹配，不将任意同文图片认作回执；原生工具重编码或缩放后字节不同时，不会宽松误确认。

### 本次验证

```bash
pnpm exec vitest run tests/unit/lib/codex-input-receipt.test.ts tests/unit/lib/input-message-match.test.ts tests/unit/lib/input-queue.test.ts tests/unit/lib/input-queue-server.test.ts tests/unit/lib/input-queue-api.test.ts tests/unit/lib/timeline-display-hook.test.ts tests/unit/lib/timeline-display-cache.test.ts tests/unit/lib/native-command-input.test.ts tests/unit/lib/queued-message-display.test.ts tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/session-parser-claude.test.ts tests/unit/lib/timeline-turn-pagination.test.ts tests/unit/lib/uploads-store.test.ts tests/unit/lib/uploads-proxy.test.ts tests/unit/lib/tmux-paste.test.ts tests/unit/lib/idle-tab-reclaimer.test.ts tests/unit/lib/idle-tab-close.test.ts tests/unit/lib/idle-tab-api.test.ts
```

- 18 个相关测试文件，205 项通过，0 项失败。
- 改动和新增 `.ts/.tsx` 文件执行 `pnpm exec eslint`：通过。
- `pnpm exec tsc --noEmit`：完整检查通过。
- `pnpm build`：通过 Next.js 编译、24 页生成、post-build 和 tsup 服务端打包；仍有已有多 lockfile 的 workspace root 推断警告。
- `git diff --check`、改动 JSON 解析及本需求文档链接检查：通过。
- UI 验证仍为 jsdom React 测试，未执行真实浏览器、手机或运行中 Codex TUI 验收；未提交、发布或重启用户当前应用。

## 第二轮 Review 修正（2026-10-21）

本轮在原需求追加验收 13–15 后实施。先运行新增反例：`input-message-match.test.ts` 与 `timeline-display-hook.test.ts` 共 7 项失败、17 项通过；失败分别对应 4 个 Codex 原生图片标记场景和 3 种无本地缓存的同文消息误确认顺序。上一轮的 205 项通过未覆盖这些反例。

### 实施与验收映射

| 验收 | 实施与实际测试 |
| --- | --- |
| 13：Codex 原生图片标记 | `input-message-match.ts` 在逐个验证图片身份后，兼容开头按图片数连续编号的原生标记，仍比较原始正文。真实 `parseCodexContent` 输出覆盖单图、多图、纯图片和用户正文中包含字面标记；不同图片、错误编号、中间标记及无图纯文本不会宽松匹配。真实文件回执测试验证增量 checker 和重试新建 checker 均能确认带标记的图片消息。 |
| 14：刷新/新客户端不能误认未投递消息 | `use-timeline.ts` 的 init、append 及补到记录匹配统一使用服务端尝试时间，不再以 createdAt 或本地时间代替。新 Hook 无缓存时，分别测试队列先到、init 先到、append 先到，第二条未投递同文消息始终 pending；第一条原生记录保留原身份。 |
| 15：快速出队和乱序同步 | `InputQueue.snapshot` 增加 `attempts: { id, at }[]`，开始调用 deliver 时登记，失败重试保留原时间，成功出队后保留；Tab 消失后清理。仅额外保存 ID 和时间。真实 InputQueue + Hook 测试模拟第一条已送达、第二条排队，第二条随后在两次轮询之间发送并出队；记录/元数据两种到达顺序最终均只有一条第二消息，且不消费较早的第一回执。 |
| 桌面/移动端同步 | `WebInputBar` 在同步占位后调用 `syncInputAttempts`，空队列也同步。通过桌面面板引用及移动面板直接回调连接 Hook；两种设备模式的 DOM 测试验证先添加占位后同步时间，并覆盖快速出队的空队列快照。 |

匹配逻辑继续共用 `matchesInputMessage`；补到的尝试时间和附件摘要统一经 `reconcileQueueReceipts` 合并，避免重复实现匹配规则（DRY）。服务端提供投递事实，Hook 负责展示合并；不新增存储依赖、正文历史或伪造成功记录（单一职责、KISS）。缺少尝试字段的旧快照保持待确认，不以兼容为理由回退到不可靠的入队时间。

### 本轮实际验证

- 沿用前节列出的 18 个测试文件命令重新运行：**220 项通过，0 项失败**，含新增 15 项回归。
- `pnpm exec tsc --noEmit`：完整检查通过；最终构建后已再次检查，包含新增测试类型。
- 所有改动和新增 `.ts/.tsx` 文件执行 `pnpm exec eslint`：通过。
- `git diff --check`、改动 JSON 解析及需求文档链接检查：通过。
- `pnpm build`：通过 Next.js 类型检查与编译、24 页生成、post-build 及 tsup；仍有已有的多 lockfile 导致 workspace root 推断警告。
- 未执行真实浏览器、手机或运行中 Codex TUI 验收；保持既有现场复现限制。未提交、发布或重启应用。

## PR #79 审查及 CI 修复

本轮核对 [PR #79](https://github.com/stirp/purplemux-improved/pull/79)，本地 HEAD 与远端审查提交均为 `444e229448cda76fe6182190b8b2aa84320848b9`，开始时工作区干净。

### 发现与实施

- [取消竞态审查意见](https://github.com/stirp/purplemux-improved/pull/79#discussion_r4328495928)：客户端最后一次轮询后，服务端可能开始发送；此时 `InputQueue.remove` 不取消正在投递的首项，但 DELETE 仍返回 200。删除 WebInputBar 中请求成功后无条件移除占位的回调，统一由已有 `canceledIds` 快照处理真实取消（KISS/DRY），不再把 HTTP 成功当作业务取消成功。
- 先添加桌面/移动模式竞态测试，修改前两项均失败：200 返回后错误调用 `onRemovePendingMessage`。修复后测试验证气泡保留并继续显示 sending；成功取消测试需收到 `canceledIds` 才删除占位，服务端并发投递测试断言被拒绝的取消不产生取消记录。
- [CI 失败运行](https://github.com/stirp/purplemux-improved/actions/runs/39471324184)：`session-tags-ui.test.ts` 拖拽句柄焦点断言失败，以及 `codex-session-records-deletion.test.ts` 未捕获的 `EACCES: mkdir '/cascade-test'`。前者的真实 Base UI 初始焦点由 rAF 延迟设置，与测试立即聚焦句柄竞争；测试在拖拽前等待该帧，保留真实 Dialog、KeyboardSensor、焦点及保存冲突断言。后者模拟 os.homedir 与 fs/promises，但真实 pino transport 线程仍写宿主路径；增加 logger mock，不放宽删除事务断言、不创建根目录或变更权限。
- 标签管理和会话删除仅修正测试时序及隔离；产品逻辑不变。本需求验收 16–17 记录本轮约定，关联既有标签浏览、会话删除规格。

### 本轮验证

- 定向命令 `pnpm exec vitest run tests/unit/lib/native-command-input.test.ts tests/unit/lib/input-queue.test.ts tests/unit/lib/session-tags-ui.test.ts tests/unit/lib/codex-session-records-deletion.test.ts`：72 项通过。
- `pnpm lint`：全仓通过；`pnpm exec tsc --noEmit`：完整类型检查通过。
- 首轮将上述静态检查与 `pnpm test` 并行执行，本地 4 核机器负载约 14，Vitest 1921 项通过、16 项失败、14 项跳过。失败包含 UI/压力用例超时、后续连锁失败及 Git 提交测试的 `noChanges`；这次运行不能作为通过证据。
- 静态检查结束后独立执行 `pnpm test`：Vitest 1936 项通过、1 项失败、14 项跳过（203 个文件通过、1 个失败、2 个跳过）。原 CI 焦点失败及 `/cascade-test` 权限错误均未再出现。剩余失败为 `git-commit.test.ts` 的 `supports the initial commit and worktrees with their own index`，在提交复核阶段报 `noChanges`，因此脚本未继续 CLI 测试。
- 定向排查 `pnpm exec vitest run tests/unit/lib/git-commit.test.ts`：22 项通过。相关 Git 产品代码及测试与 HEAD 一致，本轮未修改；全量运行与单独运行结果不同，根因尚未确定，不能宣称全量检查通过，也未通过修改断言、超时或自动重试掩盖此问题。
- 补跑 `pnpm test:cli`：153 项通过，无失败、跳过或取消。
- 本地 Node v22.14.0、Git 2.55.0；CI 配置及 package.json 要求 Node 24。本轮验证存在运行时版本差异，不能代替远端 Node 24 验证。
- `git diff --check`：通过。
- 本轮产品变更仅移除取消成功后的无条件占位删除，已用真实 WebInputBar 的桌面/移动 DOM 测试覆盖；未另行执行构建、浏览器或真实 TUI 验收，不沿用前轮构建结果作为本轮证据。
- 本轮未向 GitHub 发送评论或标记讨论已解决；未提交、推送、发布或重启应用，远端 PR/CI 状态仍是原提交的结果。

### 后续全量测试修复

用户进一步要求修复全量测试问题后，已在[Git 索引时间边界增量规格](../git-index-copy-timestamp/spec.md)中稳定复现并修复私有索引漏检。最新 `pnpm test` 完整通过：Vitest 1939 项通过、14 项跳过，CLI 153 项通过；完整 TypeScript、全仓 ESLint 通过。详见[本轮验证证据](../git-index-copy-timestamp/result.md)，上述初次失败记录保留为排查历史。
