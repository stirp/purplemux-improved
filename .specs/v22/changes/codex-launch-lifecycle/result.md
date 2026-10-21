# 实施与验证

## 2026-10-21：TUI 已启动而 Chat 报失败

### 现场与原因

- `pmuxi tab result -w ws-OeRRes tab-zaoVW0` 显示 `OpenAI Codex (v0.163.0)`、`› Ask Codex to do anything` 和模型状态行；`pmuxi tab status` 返回 `alive=true`、`command=node`、`cliState=idle`、`agentSessionId=null`。未向该会话发送任何输入。
- 当前源码 `CodexBootProgress` 给通用启动组件传入 10 秒 `errorThresholdMs`；该组件只看挂载时长，无论检测请求是否返回、进程是否运行都可以显示启动失败。这是已确认的误报路径，不能用之前的启动器取参中止解释本次现场。
- 本次没有取得用户浏览器当时的 store/网络记录，不能断言客户端未及时收到状态的具体原因。空会话 ID 是允许的启动阶段状态，不是进程失败依据。

### 实施

- `src/hooks/use-codex-boot-check.ts`：提取桌面和移动端原有重复检查。已知运行进程或有效工作状态立即切到 timeline，无需会话 ID。失败必须来自 60 秒后新发起的成功检查且明确 `running=false`；其他代理、无效响应、HTTP/网络/超时都不算启动失败，后续成功能恢复。
- 检查串行执行，完成后间隔 800 ms；单次请求含响应体最多 10 秒。请求卸载取消、迟到结果丢弃、store 时间戳保护，避免旧检测覆盖新状态；切换 Tab/会话重新计时。
- `CodexBootProgress` 接受明确失败状态，移除无条件 10 秒错误；通用 `AgentBootProgress` 保留原有计时接口以兼容其他调用方。两端面板接入共用 hook；信任/升级卡片仍优先。
- 更新 `docs/STATUS.md`。KISS/DRY：沿用现有检查 API、状态 store 和启动组件，不新增 API、进程扫描器或自动重启行为。

### 本次验证

| 检查 | 命令或方法 | 结果 |
| --- | --- | --- |
| 组件/状态/启动器回归 | `pnpm exec vitest run tests/unit/lib/codex-boot-check.test.ts tests/unit/lib/tab-store-session-view.test.ts tests/unit/lib/agent-mode-detection.test.ts tests/unit/lib/codex-tui-ready-detector.test.ts tests/unit/lib/codex-launcher-lifecycle.test.ts` | 76 项通过 |
| 完整 TypeScript | `pnpm exec tsc --noEmit` | 通过；最终补充测试后再次完整复查通过 |
| 改动文件 ESLint | `pnpm exec eslint`，指定共用 hook、三个启动/桌面组件、移动面板和新增测试 | 通过；补充测试后再次检查测试文件通过 |
| 生产构建 | `pnpm build` | 通过：Next.js 类型检查、Turbopack、24 个静态页面、standalone 后处理和 tsup 服务打包完成 |
| 差异和文档 | `git diff --check`、本需求相对链接检查 | 通过 |

新增测试在 jsdom 中挂载真实 hook、Zustand store 和 Codex 启动提示组件，模拟 fetch 和时钟，覆盖 10 秒不误报、60 秒新负向检查、无 ID 的工作状态/运行检测、失败后恢复、网络/HTTP/JSON/其他代理、响应头和体超时、请求串行、迟到检测、时间戳、切换会话/Tab、卸载计时器清理。两端接入由源码与类型/构建检查确认，未将测试 harness 称为完整页面验收。

### 本次限制

- 已读取 browser skill，但 `browser-harness` 不在当前 PATH（退出 127），未执行浏览器/移动实机验收。TUI 与服务端状态只读核对已完成。
- 未部署、未重启运行服务、未改写用户配置；当前现场不会因工作树源码修改自动切换到新版本。未提交或推送 Git。

## 2026-10-21：创建会话时取参中止的后续修正

### 诊断和实施

- 用户提供 `ws-Ax8Lpl` 连续两次启动命令均输出 `This operation was aborted`。只读核对 `~/.purplemux/codex-launcher.js`，确认现场仍使用 15 秒总期限、5 秒单次期限；取参失败发生在 `spawn('codex', ...)` 之前。
- 原逻辑对每次响应都在 5 秒主动 abort，即便服务会在有限时间内正常响应，也可能连续被取消。此前开发 HTTP 修复记录已明确留下冷编译超过启动期限的限制；本次没有取得故障当时的编译耗时，不将冷编译断言为此次现场慢响应的唯一原因。
- 共用启动器改为 60 秒总期限，请求及响应体读取使用剩余时间；快速连接失败和 502/503/504 仍按原 500 毫秒间隔重试，不重置总期限。请求超时明确报告 `/api/codex/launch-args`、60 秒期限及服务/编译日志排查方向。错误输出不包含令牌、环境变量或提示词。
- 沿用参数校验、环境覆盖、权限、resume、子进程退出语义及服务启动顺序；同步 `docs/STATUS.md`。KISS/DRY：只调整共用启动器已有期限和错误处理，不新增配置、备用启动通道或重复参数构建逻辑。

### 本次验证

| 检查 | 命令或方法 | 结果 |
| --- | --- | --- |
| 启动器、环境及 API | `./node_modules/.bin/vitest run tests/unit/lib/codex-launcher-lifecycle.test.ts tests/unit/lib/codex-launcher-environment.test.ts tests/unit/lib/codex-environment-api.test.ts tests/unit/lib/server-agent-startup.test.ts` | 3 个文件、48 项通过；启动顺序测试首次因沙箱禁止监听临时端口失败，见下一行重跑 |
| 服务启动顺序 | `rtk proxy pnpm exec vitest run tests/unit/lib/server-agent-startup.test.ts`，沙箱外重跑 | 1 项通过；合计 4 个文件、49 项通过 |
| 真实 HTTP 慢响应对比 | `node /tmp/purplemux-codex-launch-wait-verify.cjs`，隔离本机临时端口、真实 fetch、VM 执行真实生成脚本、模拟子进程 | 服务固定延迟 20 秒返回：HEAD 旧脚本发出 3 次请求，15006 ms 后报 `This operation was aborted`，退出 1，未启动子进程；修复脚本只请求 1 次，20045 ms 后调用一次子进程启动，无错误 |
| 完整 TypeScript | `./node_modules/.bin/tsc --noEmit` | 通过 |
| 改动文件 ESLint | `./node_modules/.bin/eslint src/lib/providers/codex/index.ts tests/unit/lib/codex-launcher-lifecycle.test.ts` | 通过 |
| 生产构建 | `rtk proxy pnpm build` | 通过：Next.js 类型检查、Turbopack 编译、24 个静态页面、standalone 后处理及 tsup 服务打包完成 |
| 文档与差异格式 | 本需求 3 个 Markdown 链接检查、`git diff --check` | 通过 |

新增自动化覆盖新建/恢复两种参数、响应头/体分别等待 20 秒后成功、永久停滞 60 秒后清晰报错、先连接失败再停滞时共享原截止时间，以及成功/失败后的计时器清理。原有认证失败、无效响应、环境覆盖和正常退出不重启等回归通过。

当前工作树初始无依赖；沙箱内 pnpm 无法创建包管理器临时目录，获准在沙箱外以 `pnpm install --offline --frozen-lockfile --ignore-scripts` 安装现有锁文件依赖，无包清单或锁文件变更。真实 HTTP 验证和服务启动测试也因监听端口权限在沙箱外执行。

### 本次限制

- 未部署、未改写运行中的 `~/.purplemux/codex-launcher.js`，未重启服务；运行服务加载此版本并重新创建/恢复会话时，现有 `ensureCodexLauncherScript` 会更新启动器。
- 未进行真实 Codex 登录/对话、浏览器或移动端验收；真实 HTTP 验证模拟了慢响应和子进程，不等同于完整应用冷编译或真实会话验收。
- 60 秒仍是明确上限，超出期限的服务卡死/编译需要按新的错误提示继续排查。本次不解决所有服务器慢响应原因。

以下保留 2026-10-20 原始实施证据，其中 15 秒/5 秒属于修正前策略，不代表当前规格。

## 调查证据

2026-10-20，只读检查现存 tmux pane 内容发现，`tab-p26YSS`、`tab-DEnWwj`、`tab-dkVV5G`、`tab-szywTZ` 的 Codex 恢复命令后显示 `fetch failed` 或 `purplemux port file is missing`，随后回到 fish（退出码 1）。这些记录证明启动器失败，不证明 Codex 原生进程崩溃；用户此次异常尚无确切时间/标签可供关联。

修复前 `server.ts` 在 HTTP 服务启动和 `ensureHookSettings` 之前调用 `autoResumeOnStartup`，而 Codex 启动器读取 `~/.purplemux/port` 并请求 `/api/codex/launch-args`，任一步失败即退出。现有检测会将命令行含 codex 的 Node 包装进程视为运行中，因此启动器退出也能表现为会话突然消失。

Web 输入草稿由 `use-web-input.ts` 按 tab ID 保留；同一标签重新启动后文字恢复符合现有行为。本次未改变或发送草稿。

## 实施

- `server.ts`：自动恢复移至 HTTP 监听、Hook/实际端口文件、CLI 令牌和工作区提示文件准备之后；状态管理器仍先初始化，启动宽限期可正常记录。
- `src/lib/providers/codex/index.ts`：共用生成启动器针对端口暂缺、连接失败、HTTP 502/503/504 有限重试。总期限 15 秒，间隔 500 毫秒，每次请求及响应体读取上限 5 秒；重读端口和令牌，清理计时器和可重试响应体。认证/格式错误不重试；成功只创建一个子进程，正常退出不自动重启。
- `docs/STATUS.md`：补充服务启动与启动器重试的边界。
- 复用既有启动器和 provider，未增加配置项或新的进程管理层；将一次取参和重试分开，保持环境校验与子进程退出语义一致（KISS、DRY、单一职责）。

## 本次验证

| 验收项 | 检查与结果 |
| --- | --- |
| 启动前置条件 | `server-agent-startup.test.ts` 执行真实 `start()`，模拟 Next prepare 和存储，使用独立临时 HTTP 监听器；prepare 完成前不得恢复，恢复时验证监听可访问、状态管理器/端口/Hook/令牌/提示均已初始化。通过。 |
| 启动器容错与期限 | `codex-launcher-lifecycle.test.ts` 在 VM 中执行真实生成脚本，以虚拟时钟和模拟子进程验证暂缺端口、连接失败、502/503/504、慢响应头/体、持续失败、格式/认证失败及正常退出。通过。 |
| 兼容回归 | 下列 9 个文件合计 119 项通过，包括环境覆盖、resume、会话检测、TUI 就绪和闲置回收。 |
| 完整类型检查 | `./node_modules/.bin/tsc --noEmit`：通过。首次暴露新增测试辅助函数参数类型不匹配，修正后完整重跑通过。 |
| ESLint | 下列全部改动 TypeScript 文件通过。 |
| 生产构建 | `pnpm build`：Next 页面/API、post-build、服务端 tsup 均通过。Next 提示检测到多个锁文件、自动推断 workspace root；未阻断构建。 |
| 差异格式 | `git diff --check`：通过。 |

```bash
./node_modules/.bin/vitest run \
  tests/unit/lib/codex-launcher-lifecycle.test.ts \
  tests/unit/lib/codex-launcher-environment.test.ts \
  tests/unit/lib/server-agent-startup.test.ts \
  tests/unit/lib/codex-environment-api.test.ts \
  tests/unit/lib/codex-active-session-fallback.test.ts \
  tests/unit/lib/codex-session-detection.test.ts \
  tests/unit/lib/codex-tui-ready-detector.test.ts \
  tests/unit/lib/claude-launcher-environment.test.ts \
  tests/unit/lib/idle-tab-reclaimer.test.ts

./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint server.ts src/lib/providers/codex/index.ts \
  tests/unit/lib/codex-launcher-environment.test.ts \
  tests/unit/lib/codex-launcher-lifecycle.test.ts \
  tests/unit/lib/server-agent-startup.test.ts
pnpm build
git diff --check
```

## 限制

- 未重启正在服务用户的 purplemux，未对已有 Codex 会话发送输入或终止信号；修改尚未部署到运行服务。
- 未进行桌面浏览器、移动实机或真实 Codex 登录/对话的端到端验收。此次修复覆盖已确认的启动竞态及瞬时取参失败，不将其描述为所有 Codex 退出原因的修复。
