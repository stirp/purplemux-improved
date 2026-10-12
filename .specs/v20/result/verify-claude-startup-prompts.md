# Claude 启动信任提示验证记录

日期：2026-10-10。

## 自动化检查

- `pnpm install --frozen-lockfile`：通过，安装当前工作树依赖，锁文件未改动。
- `pnpm exec vitest run tests/unit/lib/trust-prompt-detector.test.ts tests/unit/lib/trust-prompt-hook.test.ts tests/unit/lib/claude-tui-ready-detector.test.ts tests/unit/lib/codex-update-prompt-detector.test.ts`：4 文件、24 项通过。
- `pnpm exec tsc --noEmit`：完整 TypeScript 检查通过。
- `pnpm exec eslint`（4 个改动源码文件及 2 个测试文件）：通过。首次测试 Harness 在 render 中赋值触发 globals 规则，改为 effect 后重新检查及测试均通过。
- `git diff --check`：通过。
- `pnpm build`：通过，Next.js 编译、完整类型检查、24 页静态生成、post-build 和 tsup 服务端构建全部完成。
- `pnpm build:server`：通过。

## 验收映射

| 条件 | 本次证据 |
| --- | --- |
| 桌面与移动端跨 CLI 状态显示卡片 | 两个容器均移除 inactive 限制；Hook 测试启用后读取已有缓冲。真实浏览器未执行。 |
| 新旧 Claude 选项兼容 | 截图文本回归、退出在前与信任在前、当前选择变化、旧数字回答测试通过。 |
| 切换标签、重连输出重新检测 | Hook 初始缓冲、标签立即隔离、取消待执行检测测试通过；解析回调触发检测经源码检查，真实重连未执行。 |
| 提示消失及过期卡片保护 | 消失恢复、目录变化拒绝发送、旧标签回调拒绝发送测试通过。 |
| Codex 回归 | 检测及数字回答测试通过；现有 Codex 更新提示测试通过。 |

## 验证边界

React Hook 交互在 jsdom 下验证；尚未运行真实浏览器、移动设备或真实 Claude/Codex CLI 的启动确认。未自动信任任何目录。

## Review 后重新验证

- 6 个相关测试文件共 56 项通过：信任解析、信任 Hook 与真实卡片按钮、共享 permission 解析、终端 Hook、Claude 就绪检测、Codex 更新提示。
- 另运行 `config-theme-sync.test.ts`、`terminal-websocket-flow.test.ts`：2 文件 6 项通过。共 8 文件 62 项。
- 完整 `pnpm exec tsc --noEmit` 通过；本轮新增及改动的 15 个源码/测试文件 ESLint 通过；`git diff --check` 通过。
- Review 修复后重新执行 `pnpm build`：Next.js 类型检查、编译、24 页静态生成、post-build 和 tsup 服务端构建全部通过。
- 新回归覆盖：导航键和 Enter 的独立写入及 80ms 时序、光标未移动禁止提交、延时提交取消、同标签不同会话隔离、括号说明中的 Yes、无编号与窄编号换行、最近提示块、未知光标无数字回退、缩放后路径不可见时卡片保留并可重试，以及 xterm 实际 isWrapped 合并。
- 移动端查看终端入口经源码接线检查，真实浏览器、移动设备及真实 Ink/Claude CLI 验收仍未执行。
