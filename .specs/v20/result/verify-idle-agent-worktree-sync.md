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
