# 实施与验证

## 实施

2026-10-21 开始实施，2026-10-22 继续完成中断后的验证与记录。规格先于本次代码修改建立，见 [spec.md](./spec.md)。

只读现场证据：`ws-Ax8Lpl/tab-yC4zDu` 的布局保存 Codex provider、根会话 ID 和 JSONL 路径，当前视图为 Terminal、标题为 node；旧 CLI 列表却返回空 provider 和会话 ID。工作流索引仍保留同一 Codex 根会话，说明此次异常的已知关联可从原数据恢复，不需要猜测或删除历史记录。没有修改现场布局和会话数据。

| 维度 | 来源 | 本次职责约定 |
| --- | --- | --- |
| Agent 身份 | `agentState` | 保存 provider、根会话、JSONL、摘要；独立于视图 |
| 当前视图 | `panelType` | 选择 Chat / Terminal 等展示方式 |
| 进程观测 | `currentProcess`、进程树检测 | 保留 node 等实际观测，确认存活，不替代持久身份 |
| 工作状态 | `cliState`、hook、根 JSONL | 视图切换后继续更新 Review、busy、退出等状态 |

变更入口：

- `src/lib/tab-agent-identity.ts` / `tab-agent-provider.ts`：前后端共享身份解析；旧布局归一化；Agent 切换的绑定转换。
- `src/lib/layout-store.ts`、`src/hooks/use-layout.ts`：新建即保存 provider，无原生会话 ID 也保留绑定；切换 Terminal 不清空身份；两端使用同一转换规则。
- `src/lib/status-manager.ts`：初始化、轮询、hook 校验、根 JSONL 监听及历史记录使用稳定 provider；确认退出仍保留可恢复会话。
- `src/pages/api/check-agent.ts` 和 CLI Tab 接口：优先检测已绑定 Agent，返回原根会话；仍验证实际进程，不能仅凭持久数据报告存活。
- `src/hooks/use-tab-store.ts`、`src/lib/agent-check.ts`、`agent-switch-lock.ts`：运行状态和身份分离，同 provider 检测不覆盖根会话；无效响应不是退出证据；更新的活动事件使旧退出检测失去解锁效力。
- `src/lib/session-workflow.ts`、`workspace-store.ts`、`auto-resume.ts`、`idle-tab-reclaimer.ts`：会话分组、查询、恢复和回收消费同一身份，保留原生会话去重、用户元数据及安全检查。
- 桌面/移动端标题、图标、工作区状态和视图菜单使用绑定身份；`docs/STATUS.md` 同步职责和时序规则。

复用已有 `agentState` 数据格式及 provider 注册表，不新增绑定存储、进程轮询器或 Node 包装器猜测规则。新增纯函数集中实现身份解析和视图转换，避免各入口重复判断。

## 验证

2026-10-22 首次实现检查（下方 Review 修正另有本次运行结果）：

- 相关 Vitest：21 个测试文件、223 项测试通过，退出码 0。
- `pnpm exec tsc --noEmit`：完整 TypeScript 检查通过，退出码 0。
- `pnpm exec eslint`：检查全部改动与新增的 TypeScript/TSX 文件，通过且无警告，退出码 0；文件集合来自 `git diff --name-only --diff-filter=ACM` 和 `git ls-files --others --exclude-standard`。
- `pnpm build`：Next.js 页面编译、页面数据收集、静态生成、post-build 与 tsup 服务端构建全部通过，退出码 0。
- 规格相对链接、`depends_on` 和 STATUS 引用校验通过；`git diff --check` 通过。

相关回归命令：

```bash
pnpm exec vitest run "tests/unit/lib/tab-agent-identity.test.ts" "tests/unit/lib/tab-agent-status.test.ts" "tests/unit/lib/tab-agent-api.test.ts" "tests/unit/lib/codex-review-state.test.ts" "tests/unit/lib/agent-mode-detection.test.ts" "tests/unit/lib/idle-tab-reclaimer.test.ts" "tests/unit/lib/question-status-poll.test.ts" "tests/unit/lib/worktree-session-idle.test.ts" "tests/unit/lib/session-workflow" "tests/unit/lib/tab-store" "tests/unit/lib/tab-title.test.ts" "tests/unit/lib/layout-tab" "tests/unit/lib/workspace-compact-status.test.ts"
```

验收覆盖：

| 验收项 | 测试或检查入口 |
| --- | --- |
| 新建即绑定、旧数据恢复、布局落盘与切换 | `tab-agent-identity.test.ts`、`layout-tab-creation-cwd.test.ts` |
| Terminal 轮询、重建、确认退出、普通 node 不误认 | `tab-agent-status.test.ts` |
| Review 根会话及状态、不同 provider hook 拒绝 | `codex-review-state.test.ts`（Chat / Terminal 两种视图）、`tab-agent-status.test.ts` |
| CLI 查询和实时检测保留根身份 | `tab-agent-api.test.ts` |
| 桌面/移动菜单、超时、迟到、退出后启动入口 | `agent-mode-detection.test.ts` |
| 无效响应及退出检测时序、切换锁 | `tab-agent-identity.test.ts`、`agent-mode-detection.test.ts` |
| 去重与首次绑定元数据、重连 | `session-workflow*.test.ts`、`tab-store*.test.ts` |
| 安全 shell 与回收边界 | `worktree-session-idle.test.ts`、`idle-tab-reclaimer.test.ts` |
| 标题与工作区状态 | `tab-title.test.ts`、`workspace-compact-status.test.ts` |

首次生产构建因依赖目录软链接指向工作树外被 Turbopack 拒绝；随后使用锁文件离线安装工作树本地依赖，未调整应用构建配置或依赖版本。

未执行真实 Codex Code Review、手机 Safari 或浏览器端到端验收；React/jsdom、API/状态模拟和构建不等同于实机验证。自动恢复消费方完成源码检查，未实际重启服务或恢复用户会话。没有提交、推送或部署改动。

## 2026-10-22 Review 修正

审查指出 P1：绑定 Agent 的 Terminal 因 `cliState=idle` 跳过前台 shell 校验；P2：绑定身份错误改变 Terminal 标题优先级，进程标题遮住用户名称。本次先补充同一需求规格，再添加回归并修复。

- P1：`StatusManager.areSessionsIdle` 对 Terminal / 未指定面板先检查 idle terminal status 和 SAFE_SHELLS 前台命令，再检查绑定 Agent 的工作状态。复用现有严格 pane 快照，不新增进程检测；前台 make/vim/node 不因后台 Agent 空闲而获准执行 Worktree 操作。
- P2：`PaneTabItem` 使用当前视图选择标题优先级，Terminal 自定义名称优先；绑定身份继续控制图标和状态。Chat 继续使用上游已经解析的标题。保持展示职责分离，不复制上游标题解析逻辑。
- `docs/STATUS.md` 同步明确绑定 Agent 的 Terminal 仍受前台任务保护。

修复前运行两个针对性测试文件，实际复现 6 项失败：两种 provider 的前台任务保护和严格快照各失败一项，两种 provider 的自定义名称各失败一项。其余 15 项通过。

新增覆盖：`worktree-session-idle.test.ts` 检查两种 provider、Terminal/缺省视图、idle/ready-for-review/cancelled/inactive 状态、非 shell/未知前台、安全 shell、busy 和 server 状态、严格快照与缓存不一致；`pane-tab-item-title.test.ts` 实际渲染组件，检查自定义名称、保存后的名称更新、重命名输入初值、无名称回退和 Chat 标题兼容。

本次验证：

- 相关回归：13 个测试文件、164 项测试通过，退出码 0。命令如下。
- `pnpm exec tsc --noEmit`：完整类型检查通过，退出码 0。
- `pnpm exec eslint "src/lib/status-manager.ts" "src/components/features/workspace/pane-tab-item.tsx" "tests/unit/lib/worktree-session-idle.test.ts" "tests/unit/lib/pane-tab-item-title.test.ts"`：通过，无警告，退出码 0。
- 规格相对链接检查与 `git diff --check` 通过。
- `pnpm build`：Next.js 生产构建、post-build 和 tsup 服务端构建全部通过，退出码 0。

```bash
pnpm exec vitest run "tests/unit/lib/worktree-session-idle.test.ts" "tests/unit/lib/pane-tab-item-title.test.ts" "tests/unit/lib/tab-agent" "tests/unit/lib/codex-review-state.test.ts" "tests/unit/lib/agent-mode-detection.test.ts" "tests/unit/lib/idle-tab-reclaimer.test.ts" "tests/unit/lib/worktree-manager.test.ts" "tests/unit/lib/worktree-tools.test.ts" "tests/unit/lib/app-update-guard.test.ts" "tests/unit/lib/layout-tab-rename.test.ts" "tests/unit/lib/workspace-compact-status.test.ts"
```

未执行浏览器/手机实机验收；组件验证使用 React/jsdom。没有操作用户正在运行的 Agent 或真实 Worktree，没有提交、推送或部署。

## PR #86：端口检测与绑定校验

本次读取 [P1 评论](https://github.com/stirp/purplemux-improved/pull/86#discussion_r4340374278) 和 [P2 评论](https://github.com/stirp/purplemux-improved/pull/86#discussion_r4340374287)，确认本地 HEAD 与远端被审查提交均为 `706186c652adf4301afad28a2764896b2eac75a9`，且实施前工作树干净。这是后续两条新评论，不重复沿用上一轮的验证结论。

实施：

- P1：`status-manager.ts` 在初始扫描和轮询中，对 Terminal / 缺省面板执行原有 `detectTerminalStatus()`，保留真实端口及 server/running/idle 状态，不以持久 provider 绑定合成 idle。Chat 视图原有策略继续沿用。复用原检测入口，不引入额外进程采集器。
- P2：`check-agent.ts` 已绑定时只校验对应 provider，未运行直接返回 running=false；未绑定才使用 provider 注册表遍历。显式切换后使用新绑定。保持原根会话、不修改布局，避免客户端检测结果和随后状态同步产生身份冲突。
- 同步本需求规格、任务与 `docs/STATUS.md` 的行为说明。

针对性证据：先运行 `tab-agent-status.test.ts` 和 `tab-agent-api.test.ts`，修复前共 6 项失败、11 项通过。失败分别覆盖两种 provider 的 Terminal/缺省面板端口丢失（4 项），以及绑定 provider 退出后错误回退到另一 provider（2 项）。

回归覆盖：初始 rescan、新 Tab 轮询、已有 Tab 轮询、后台端口消失后恢复 idle；实际 `areSessionsIdle()` 在服务器存在时拒绝操作；接口结果经过真实 `applyAgentCheckResult()` 后仍保留原身份；未绑定发现、显式切换、根会话保持。

本次检查：

- 相关回归：12 个测试文件、161 项测试通过，退出码 0；命令如下。
- `pnpm exec tsc --noEmit`：完整类型检查通过，退出码 0。
- `pnpm exec eslint "src/lib/status-manager.ts" "src/pages/api/check-agent.ts" "tests/unit/lib/tab-agent-status.test.ts" "tests/unit/lib/tab-agent-api.test.ts"`：通过，无警告，退出码 0。
- 规格本地链接及 `depends_on` 校验、`git diff --check` 通过。
- `pnpm build`：Next.js 生产构建、post-build 和 tsup 服务端构建全部通过，退出码 0。

```bash
pnpm exec vitest run "tests/unit/lib/tab-agent" "tests/unit/lib/worktree-session-idle.test.ts" "tests/unit/lib/status-refresh-snapshot.test.ts" "tests/unit/lib/question-status-poll.test.ts" "tests/unit/lib/codex-review-state.test.ts" "tests/unit/lib/agent-mode-detection.test.ts" "tests/unit/lib/agent-provider-detection.test.ts" "tests/unit/lib/worktree-manager.test.ts" "tests/unit/lib/worktree-tools.test.ts" "tests/unit/lib/app-update-guard.test.ts"
```

未执行真实后台服务器、Worktree 操作、浏览器或手机实机验收；测试模拟系统进程/端口观测，调用真实状态管理、接口与客户端更新逻辑。未修改用户现场数据，未提交、推送或在 PR 发送消息。
