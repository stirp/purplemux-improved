# 实施与验证

## 实施

- 原解析器仅支持 `Do you trust the contents of this directory?` 和 `Yes, continue / No, quit`。本机 `codex-cli 0.163.0` 的可执行文件已包含 `Folder access`、`Trust this folder?`、`Trust and continue`、`Open restricted`、`Open existing task` 等新文案，旧解析返回空结果。
- 同时查阅上游 [trust_directory.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/onboarding/trust_directory.rs)：原生菜单根据 restricted/existing_task/cancel 显示不同说明与选项，不能统一映射为旧版 yes/no。上游 main 仅作为格式参考，不宣称与本地二进制完全一致。
- `src/lib/trust-prompt-detector.ts`：新增原生目录访问菜单检测，组合独立标题、信任说明及已聚焦选项，支持说明和选项换行、路径截断，不依赖完整路径；旧解析和回答按键保持兼容。
- `src/hooks/use-trust-prompt-detector.ts`：同一次缓冲检测返回 `nativeTrustPrompt`，沿用 200ms 去抖与 scope 隔离；禁用、切换 scope 或卸载时清除结果，避免处理完成后返回 Chat 又被旧结果切回终端。
- `pane-container.tsx` 与 `mobile-surface-view.tsx`：仅当前 Codex 面板未绑定会话 ID、CLI 为 inactive/unknown 且出现原生菜单时调用既有终端面板切换，不发送输入，不重启会话。已建立会话中的原生提示保持手动终端入口。
- `codex-panel.tsx` 与 `mobile-codex-panel.tsx`：旧版信任卡片补齐查看终端按钮，启动页接入同一回调。`agent-boot-progress.tsx` 在等待阶段也显示已有可选终端按钮。
- 保持 KISS/DRY：复用终端缓冲、信任 Hook、已有 panelType 切换、按钮文案及启动组件，不引入新接口、配置、轮询或泛化菜单提交协议。

## 验证

| 验收 | 本次证据 |
| --- | --- |
| 原生提示识别，避免错误 yes/no | `trust-prompt-detector.test.ts` 覆盖信任/受限打开/既有任务说明、不同聚焦选项、窄屏换行、截断路径和非菜单输出 |
| 旧版兼容 | 原有 Claude/Codex 解析与提交测试通过 |
| 生命周期隔离，不自动回答 | `trust-prompt-hook.test.ts` 覆盖已有缓冲、scope 切换、禁用/重启用、输出清除、返回 Chat 不复用旧结果，并断言不发送 stdin |
| 等待/失败手动入口 | `codex-boot-check.test.ts` 在真实 React 组件中点击两个阶段的终端按钮；桌面/移动端回调接线另经源码检查 |
| 两端自动切换 | 源码检查确认两端消费同一检测状态并使用已有面板切换；未进行真实浏览器/移动设备点击验收 |

执行命令：

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/lib/trust-prompt-detector.test.ts tests/unit/lib/trust-prompt-hook.test.ts tests/unit/lib/codex-boot-check.test.ts tests/unit/lib/codex-update-prompt-detector.test.ts tests/unit/lib/codex-tui-ready-detector.test.ts tests/unit/lib/claude-tui-ready-detector.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/lib/trust-prompt-detector.ts src/hooks/use-trust-prompt-detector.ts src/components/features/workspace/pane-container.tsx src/components/features/workspace/codex-panel.tsx src/components/features/workspace/agent-boot-progress.tsx src/components/features/mobile/mobile-codex-panel.tsx src/components/features/mobile/mobile-surface-view.tsx tests/unit/lib/trust-prompt-detector.test.ts tests/unit/lib/trust-prompt-hook.test.ts tests/unit/lib/codex-boot-check.test.ts
pnpm build
git diff --check
```

- 相关回归：6 文件，85 项通过；测试在 Node/jsdom 中运行。
- 最后校正聚焦选项测试样本后，单独重跑解析器测试：25 项通过。
- 完整 `pnpm exec tsc --noEmit`：通过。
- 改动文件 ESLint：通过，无问题。
- `pnpm build`：通过，Next.js 页面构建、静态生成、post-build 与 tsup 服务端构建均成功。
- `git diff --check`：通过；新增规格的本地链接及 depends_on 路径检查通过。依赖按锁文件安装，未修改依赖清单或锁文件。
- 本机 CLI 临时空目录启动检查没有出现 trust 菜单，两个检查进程均已通过 Ctrl+D 正常退出；未执行信任选择。不能将文案核对或 jsdom 测试当作原生 CLI 信任流程的完整实机验收。
- 未执行真实浏览器、移动设备或用户原故障会话的端到端验收；原生菜单操作后可由已有入口返回 Chat。

## 评审修正与本轮验证

用户要求修复 `claude-code-review` 提出的两项 P2 问题，先更新同一需求规格，再修改实现。

- 完整菜单引用误触发：两端把启动条件传给共享 Hook 的 `nativePromptEnabled`。非启动阶段默认不启用原生菜单自动切换；条件变更立即屏蔽已有结果，并取消待检测任务。原有 Claude/Codex 卡片解析不受这个开关影响。`docs/STATUS.md` 同步说明 UI 边界，不改变服务端工作状态推导。
- 折叠尺寸不一致：将现有尺寸归一化移入 `useTerminal.fit()`，先读取 `FitAddon.proposeDimensions()`、应用策略，再一次性 resize 本地 xterm；首连、resize 消息直接复用实际尺寸。初始化、ResizeObserver、字体加载、手动 fit 都走同一入口，避免先缩为 12 行再放大。展开/普通终端恢复可见尺寸，未传策略的调用继续使用默认 FitAddon 拟合。`docs/TMUX.md` 同步说明本地/PTY 尺寸约定。
- 新回归覆盖完整菜单引用、返回 Chat、检测等待期间/完成后进入会话；尺寸测试把真实 `@xterm/xterm` 解析器嵌入 Hook 测试替身，通过实际写入队列写 ANSI 输出，标题位于第 1 行、聚焦选项位于第 30 行。模拟 DOM 仅提供 12 行时，本地缓冲与发送尺寸均为 40 行，字体变化、ResizeObserver 和手动 fit 不出现中间缩小，展开后恢复为 12 行。
- 本轮没有重新运行独立子代理评审；以上是针对两项 findings 的实现和自动化验证。

本轮重新执行：

```bash
pnpm exec vitest run "tests/unit/lib/trust-prompt-detector.test.ts" "tests/unit/lib/trust-prompt-hook.test.ts" "tests/unit/lib/codex-boot-check.test.ts" "tests/unit/lib/codex-update-prompt-detector.test.ts" "tests/unit/lib/codex-tui-ready-detector.test.ts" "tests/unit/lib/claude-tui-ready-detector.test.ts" "tests/unit/lib/terminal-typography-hook.test.ts" "tests/unit/lib/terminal-write-queue.test.ts" "tests/unit/lib/terminal-websocket-flow.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/hooks/use-terminal.ts" "src/hooks/use-trust-prompt-detector.ts" "src/lib/trust-prompt-detector.ts" "src/components/features/workspace/pane-container.tsx" "src/components/features/workspace/codex-panel.tsx" "src/components/features/workspace/agent-boot-progress.tsx" "src/components/features/mobile/mobile-surface-view.tsx" "src/components/features/mobile/mobile-codex-panel.tsx" "tests/unit/lib/trust-prompt-detector.test.ts" "tests/unit/lib/trust-prompt-hook.test.ts" "tests/unit/lib/terminal-typography-hook.test.ts" "tests/unit/lib/codex-boot-check.test.ts"
pnpm build
git diff --check
```

- 9 个测试文件、107 项通过；完整 TypeScript 与全部改动 TS/TSX 文件 ESLint 通过。
- 本轮 `pnpm build`：通过，Next.js 编译、24 个静态页面生成、post-build 及 tsup 服务端构建均成功。
- 本轮 `git diff --check` 与规格链接/depends_on 路径检查通过。
- 真实 xterm 测试仍运行于 jsdom，容器尺寸/字体加载/resize 观察器为替身；不等同于完整浏览器、移动设备或原生 Codex 启动流程验收，这些项目本轮未执行。

## 合并冲突解决

- 当前分支合入 `ece0433a0c08d3df059bed65af2fbd50358a01fb` 时，唯一冲突文件为 `src/hooks/use-terminal.ts`。依据本需求与 [duplicate-message-on-send](../duplicate-message-on-send/spec.md) 现有约定合并，不新增产品行为。
- 同时保留 `normalizeSize` 和 `inputEnabled`；回调引用使用合入分支的 `useLayoutEffect` 更新，并将尺寸策略纳入引用和依赖，避免丢失隐藏终端输入防护或尺寸归一化。
- 扩展既有终端尺寸回归：折叠时显式关闭输入，但仍可用真实 xterm 解析器读取第 1 行标题和第 30 行菜单；展开后验证恢复输入及可见尺寸。其余自动合并文件保留原合并结果。
- 本轮相关测试：10 个文件、164 项通过，覆盖 trust 解析/Hook、终端尺寸、输入隔离、桌面/移动接线、原生命令、WebSocket、Codex 输入状态与回执、服务端队列。

```bash
pnpm exec vitest run "tests/unit/lib/trust-prompt-detector.test.ts" "tests/unit/lib/trust-prompt-hook.test.ts" "tests/unit/lib/terminal-typography-hook.test.ts" "tests/unit/lib/terminal-input-isolation.test.ts" "tests/unit/lib/terminal-surface-input.test.ts" "tests/unit/lib/native-command-input.test.ts" "tests/unit/lib/terminal-websocket-flow.test.ts" "tests/unit/lib/codex-input-state.test.ts" "tests/unit/lib/codex-input-receipt.test.ts" "tests/unit/lib/input-queue-server.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/hooks/use-terminal.ts" "tests/unit/lib/terminal-typography-hook.test.ts"
pnpm build
git diff --check
```

- 本轮 ESLint、完整 TypeScript、`pnpm build` 全部通过；构建包含 Next.js 编译、24 个静态页面生成、post-build 和 tsup。
- 已将冲突解决及本次测试/证据文件暂存，`git ls-files -u` 为空，`git diff --cached --check` 通过；合并仍等待提交。
- 本轮没有执行真实浏览器/移动设备验收；没有创建合并提交或推送。
