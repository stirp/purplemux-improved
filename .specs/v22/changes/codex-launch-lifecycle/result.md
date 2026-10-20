# 实施与验证

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
