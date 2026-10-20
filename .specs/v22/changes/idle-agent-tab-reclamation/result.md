# 实施与验证

## 跨域误判修正（2026-10-20）

- 闲置回收 POST 与策略 PATCH 改用共享 `isProcessActionRequestAllowed`，设置组件携带 `X-Purplemux-Process-Action: 1`。跨源明确拒绝，同源操作不因代理 Host 改写失败；回收/持久化逻辑未变。共用纯函数和常量避免两处接口规则漂移。
- 本次 4 个文件共 64 项相关测试、完整 TypeScript、改动文件 ESLint、`pnpm build` 和差异检查通过。POST/PATCH 回归断言代理同源可调用服务，跨源/非法 Origin 返回 403 且不调用服务；OPTIONS 不开放 CORS。
- 隔离浏览器验证实际防护函数：模拟 Host 改写及缺失 Fetch Metadata，带请求头的 POST/PATCH 返回 200；另一端口的跨源请求被预检拦截。没有连接真实回收服务、没有回收用户页签，不宣称实机回收验收通过。
- 命令、复现记录和限制见[本机进程管理本次验证](../local-agent-process-management/result/verify.md#跨域误判修正2026-10-20)。

## 实施

- 设置 → 本机进程增加闲置会话页签回收，默认手动、自动关闭，阈值默认 60 分钟，可设置 15～10080 分钟。策略持久化于 workspaces.json。使用 react-hook-form、zod 与现有组件；11 个语言目录补齐词条，简体中文和英文为完整正文，其余暂用英文。
- `src/lib/idle-tab-reclaimer.ts` 负责预览、串行回收、状态/原生记录/进程树核验与自动调度；`server.ts` 在服务启动后启用每分钟定时器，关闭时清理。全局锁和定时器跨 Next/custom server 模块图共享，禁用时不扫描进程。
- `GET /api/system/idle-tabs` 返回策略与候选；`PATCH` 严格校验并保存策略；`POST` 要求显式 targets、预览时的 policy 和 confirmed=true，每次最多 100 个目标。拒绝跨站写入，不接受任意命令或 PID。
- 回收前严格重查目标与策略，并调用 `retainReclaimedSession` 保存原生身份、目录、导航索引。发送信号前再次校验状态、输入及进程身份；复用既有 managed Tab 关闭协议，确认 tmux pane 及原进程退出后才移除布局。
- 输入活动由 WebSocket 和 tmux send/paste 入口记录；排队、发送中、等待完成确认、错误待处理均保护。额外 pane、未知包装器、工具/后台子进程、独立原生子代理均跳过。
- 最后一个 Tab 回收后保留空工作区。不会删除 JSONL、历史、标题、标签或人工工作状态。Sessions 优先使用持久化导航，多目录恢复沿用原目录，防止旧轮次或工作区首目录覆盖。
- 复用现有进程查询、关闭、状态、工作流与恢复入口；策略校验、执行协调和设置界面分别负责单一职责，没有增加依赖。

## 自动化验证

执行命令：

```bash
pnpm exec vitest run tests/unit/lib/idle-tab*.test.ts tests/unit/lib/session-workflow*.test.ts tests/unit/lib/session-workspace-navigation.test.ts tests/unit/lib/input-queue*.test.ts tests/unit/lib/layout-empty-workspace.test.ts tests/unit/lib/agent-process*.test.ts tests/unit/lib/local-agent*.test.ts tests/unit/lib/process-utils-list.test.ts tests/unit/lib/workspace-delete.test.ts
pnpm exec vitest run tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/idle-tab-close.test.ts
pnpm tsc --noEmit
pnpm exec eslint <本次所有修改及新增的 TypeScript/TSX 文件>
pnpm build
git diff --check
```

- 相关回归 20 个测试文件、187 项通过；随后增加真实 Sessions 组件的回收后原目录导航测试，重新执行受影响的 2 个文件、21 项全部通过（去重共 188 项）。测试使用 mock 文件、进程和关闭动作，不会发送真实终止信号。
- 完整 TypeScript、改动文件 ESLint、生产构建及差异空白检查通过。构建包含 `/api/system/idle-tabs`，Next 页面/API、post-build、服务端 tsup 均成功。

| 验收项 | 本次证据 |
| --- | --- |
| 默认值、持久化、错误重试 | policy-only 写入、默认关闭/60 分钟、保存失败保留旧值、API 越界/小数/类型校验 |
| 安全闲置判定 | busy/needs-input/unknown/inactive、压缩/权限、待确认队列、stale/缺失记录、新启动、后台工具/子代理、多 pane 均保护 |
| 保存与关闭顺序 | retain → stop → remove；保存失败、预览后活动/身份/策略变化不停止；仍存活或 Tab 替换不删除布局 |
| 历史与恢复 | 标题/标签/人工状态/原目录经后续同步仍保留；无完成轮次也有恢复索引；隐藏记录拒绝回补；原目录恢复与空工作区重启测试 |
| 并发及生命周期 | 重复请求仅停止一次、默认关闭无进程查询、每分钟自动扫描、重复启动仅一个 timer、停止后不再扫描 |
| 接口保护 | 显式确认与目标校验、部分成功/跳过结果、跨站拒绝、no-store、405 和保存失败响应 |

## 隔离浏览器验证

使用 agent-browser 的独立会话 `pmux-idle-reclaim`，将真实 IdleTabSettings、next-intl、shadcn 组件和项目 CSS 打包至临时 fixture，服务只监听 `127.0.0.1:34323`。fetch 为模拟接口，不连接真实回收 API。

- 默认开关关闭、60 分钟，候选显示工作区、Agent、目录和闲置时长。
- 取消确认框后 POST 为 0；确认提交具体目标和预览策略，未传递任意命令或额外目标。
- 模拟候选新活动时显示“已回收 0 个；跳过 1 个”及原因；模拟成功显示“已回收 1 个；跳过 0 个”，候选清空。
- 模拟保存失败展示错误，旧策略仍关闭；重试成功后策略更新、保存按钮恢复禁用。
- 桌面截图及 390×844 移动视口检查，移动 scrollWidth=390，无横向溢出，目录正常换行。浏览器运行错误为空。
- fixture 未提供字体/favicon，存在对应 404，截图使用回退字体；这是组件隔离验证，不是完整应用端到端验收。
- 已关闭独立浏览器及临时 HTTP 服务。截图：[桌面](./desktop.png)、[移动](./mobile.png)。

## 限制与未执行项

- 未停止任何真实用户 Agent 进程，未实测真实回收→Sessions→原生 resume 全链路；未执行 macOS 实机测试。前一需求的 Linux 只读进程扫描不是本需求真实回收证据。
- 保守保护会使带持久后台子进程或无法明确确认状态的会话不进入候选。回收恢复保存的原生会话，不承诺保存进程内存、未落盘状态或终端滚屏。
- 源码已实现、自动化与隔离浏览器检查通过；没有提交、部署或重启当前运行的 Purplemux。

## 合并冲突处理（2026-10-19）

- 对照本需求、`local-agent-process-management/spec.md` 和 `auto-upgrade-detection/spec.md`，解决 11 个 `messages/*/settings.json` 的同位置新增冲突。保留本分支 `processes`、`idleTabs` 和合入分支 `appUpdate`，没有覆盖任何一方业务约定。
- 逐项比较 Git 三方版本，双方全部原有词条和值均保留；11 份 JSON 解析、重复键检测和语言键集合一致性检查通过。设置入口、服务启动及 Sessions 导航的自动合并结果经检查保留双方功能。
- 本次运行相关回归：`pnpm exec vitest run tests/unit/lib/idle-tab*.test.ts tests/unit/lib/agent-process*.test.ts tests/unit/lib/app-update*.test.ts tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/session-tags-ui.test.ts`，11 个文件、101 项全部通过。
- 完整 `pnpm tsc --noEmit` 通过；设置对话框、通知面板、三个设置组件及 server.ts 的 ESLint 通过；`git diff --cached --check` 通过。仅合并词条，未修改界面结构或运行逻辑，本次未重复生产构建或浏览器验证。
- 冲突文件已加入暂存区，`git ls-files -u` 为空；不创建合并提交或推送。

## PR #71 评审修复（2026-10-20）

- 对应[评审问题](https://github.com/stirp/purplemux-improved/pull/71#discussion_r4315906335)：旧流程销毁 tmux 后才检查存活进程，失败时保留布局无法保留可重连终端。本节修正此前实施记录的关闭顺序。
- 新增 `idle-agent-shutdown.ts`，仅向已核验的末端 Agent 发送 SIGTERM，最多等待约 10 秒确认 Agent 与已知 Node 包装器退出。等待期间不终止 shell、不执行 tmux kill-session、不升级 SIGKILL；超时、查询失败、身份复用或新增进程均中止后续销毁。发送前后均检查进程树，等待后再次保护新输入。
- `killSession` 在保护回调完成后重新确认 pane 身份，防止等待期间终端被替换。普通显式关闭语义不变；仅闲置回收在回调中执行上述退出确认。
- 本次相关回归：12 个文件、82 项通过。新增测试调用真实 `killSession` 和真实退出协调逻辑，模拟进程信号与 tmux 命令，断言拒绝 SIGTERM/包装器存活时实际 tmux 会话未销毁，成功路径先观察 Agent 退出再销毁。
- 完整 `pnpm tsc --noEmit`、7 个修改/新增 TS 文件 ESLint、`git diff --check` 通过。`pnpm build` 通过（Next.js 编译、静态页面生成、post-build、服务端 tsup 均完成）。本次未执行浏览器和真实进程停止；UI/API 形状未改变。

## 定时任务与 Linux 自启动合并（2026-10-20）

- 对照本需求及 `scheduled-tasks/spec.md`、`configurable-auto-start-on-boot/spec.md`，解决 15 个冲突文件：11 份设置词条、设置组件、工作区存储、共享类型及删除工作区测试。合并保留双方能力及已有 PR #71 修复，没有替代既有行为约定。
- 同时保留 `idleTabPolicy` 与 `scheduledTasks` 的可选类型和写入缓存键；保留迁入记录保存、定时任务读写与孤立任务清理。设置组件同时保留本机进程入口和 Linux 自启动开关，测试保留双方原有案例。
- 新增共享存储回归：交替仅修改回收策略、仅修改任务名称/启用状态，验证两者实际落盘且进程迁入记录保留。11 份词条经三方逐值比对、重复键和键集合检查；PR #71 的 4 个运行时代码文件与 HEAD 字节一致。
- 本次执行以下回归命令，14 个文件、172 项全部通过：

```bash
pnpm exec vitest run tests/unit/lib/workspace-delete.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/idle-agent-shutdown.test.ts tests/unit/lib/idle-tab*.test.ts tests/unit/lib/agent-process*.test.ts tests/unit/lib/scheduled-task*.test.ts tests/unit/api/scheduled-tasks.test.ts tests/unit/lib/linux-startup-settings.test.ts
pnpm tsc --noEmit
pnpm exec eslint src/components/features/workspace/settings-dialog.tsx src/lib/workspace-store.ts src/types/terminal.ts tests/unit/lib/workspace-delete.test.ts
```

- 完整类型检查和冲突涉及的 4 个 TS/TSX 文件 ESLint 通过；`pnpm build` 完成 Next.js 编译、页面生成、post-build 与服务端 tsup。`git diff --cached --check` 通过，`git ls-files -u` 为空。15 个冲突文件及本记录已暂存，没有创建合并提交或推送。本次未执行实机进程操作、启动项注册或浏览器验证。
