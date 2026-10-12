# 空闲 Agent 同步验证记录

- 日期：2026-10-12
- 需求：[idle-agent-worktree-sync](../requirements/idle-agent-worktree-sync.md)
- 规格：[worktree-sync-delivery](../features/worktree-sync-delivery/spec.md)

## 实际检查

| 检查 | 命令与结果 |
| --- | --- |
| 相关回归 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/worktree-tools.test.ts tests/unit/lib/worktree-session-idle.test.ts tests/unit/lib/worktree-session-safety.test.ts tests/unit/lib/worktree-manager.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts tests/unit/lib/worktree-actions-api.test.ts`：6 文件 76 项通过 |
| 完整 TypeScript | `node node_modules/typescript/bin/tsc --noEmit`：通过 |
| 改动代码 ESLint | `node node_modules/eslint/bin/eslint.js src/lib/worktree-sync.ts src/components/features/workspace/worktree-delivery-dialog.tsx tests/unit/lib/worktree-tools.test.ts tests/unit/lib/worktree-session-idle.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts`：通过 |
| 生产构建 | `pnpm build`：Next.js 类型检查、编译、页面生成、post-build 和服务端 tsup 通过 |
| 翻译及差异 | 11 种 workspace JSON 可解析并包含 syncSessionsBlocked；`git diff --check` 通过 |

## 验收映射

- IA-01：StatusManager 测试覆盖 Claude/Codex 的 idle、ready-for-review、cancelled；临时 Git 仓库验证空闲会话预览去除 sessions，merge/rebase 成功。实现未引用 killSession，删除流程未修改。
- IA-02：既有空闲检测覆盖 busy、needs-input、unknown、压缩上下文、运行中的终端和未知会话；额外 pane 与状态刷新失败仍返回 sessions。严格 tmux 查询失败闭合行为测试通过；权限请求拒绝沿用现有 areSessionsIdle 条件。
- IA-03：预览后开始任务、最终 Git 校验期间变忙、最终状态刷新期间写入未提交文件，均拒绝同步且 HEAD 不变。
- IA-04：相关真实 Git 回归覆盖目标变化、未提交文件、同分支目标、忽略文件保护及冲突 continue/abort；既有删除安全测试通过。
- IA-05：共享弹窗测试验证 sessions 禁用按钮并显示同步专属提示；既有目标选择、刷新及草稿目标回归通过。

## 限制

本次使用临时 Git 仓库、合成状态及组件测试，未操作用户真实分支。
未执行浏览器或真实 Claude/Codex 端到端验收、完整应用全量测试、重新打包安装或发布。
实际使用需运行包含本次修改的版本，并在同步弹窗刷新；截图中的 dirty 阻断仍要求先处理未提交文件。

## PR #30 Review 验证

本节单独记录 Review 修复后的运行结果，不复用上一轮 76 项测试作为本轮证据。

- P1 / IA-06：新增 Claude、Codex 和普通终端的 node、make、vim、未知前台命令拒绝测试，以及严格快照覆盖缓存 bash、缺失 pane 和真实 shell 放行测试。
- P2 / IA-07：真实 StatusManager 测试验证提供快照时不再次调用非严格查询，并保留无快照时的普通轮询路径；临时 Git 仓库验证 overview 成功而后续严格查询失败时拒绝同步、HEAD 不变。
- 首轮相关回归：`node node_modules/vitest/vitest.mjs run tests/unit/lib/status-refresh-snapshot.test.ts tests/unit/lib/worktree-session-idle.test.ts tests/unit/lib/worktree-tools.test.ts tests/unit/lib/worktree-manager.test.ts tests/unit/lib/worktree-session-safety.test.ts`：5 文件 70 项通过；随后补充了严格查询后续失败用例，包含于本轮全量验证。
- 完整 `node node_modules/typescript/bin/tsc --noEmit` 及改动代码 ESLint 通过；docs/STATUS.md 与 spec 已同步。
- 首次 `pnpm test` 与生产构建同时运行：895 项通过、1 项可选微基准跳过，既有 terminal-write-queue 的 64 MiB 压力测试超过默认 5 秒超时，CLI 阶段未执行。后续限制测试并发重跑，结果另列。
- 构建结束后 `pnpm exec vitest run --maxWorkers=2`：122 个文件、896 项通过、1 项可选微基准跳过，包括原超时的 64 MiB 压力测试；未修改其逻辑和默认超时。
- 本次 `pnpm build`：Next.js 类型检查、编译、页面生成、post-build 与服务端 tsup 通过。
- 本次 `pnpm test:cli`：61 项通过，无失败或跳过。
- 最终完整 TypeScript、改动代码 ESLint 和 `git diff --check` 通过。
- 浏览器/真实 Agent 实机验收未执行；未提交、推送或在 GitHub 发送评论/关闭 Review 线程。
