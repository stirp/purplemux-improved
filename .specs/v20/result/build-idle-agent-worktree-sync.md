# 空闲 Agent 同步实施记录

- 日期：2026-10-12
- 需求：[idle-agent-worktree-sync](../requirements/idle-agent-worktree-sync.md)
- 规格：[worktree-sync-delivery](../features/worktree-sync-delivery/spec.md)

旧同步代码无条件保留 sessions 阻断，进程是否空闲未参与判断。
本次先补齐同步行为规格，再修改 src/lib/worktree-sync.ts：预览与执行复用 StatusManager.areSessionsIdle；严格检查额外 tmux pane，刷新失败时继续阻断。
执行前重新刷新会话状态、重新读取工作树快照并校验 blockers，再检查最新会话状态。merge/rebase/continue/abort 共用同步保护，不调用 killSession，不改变 Worktree 删除逻辑。

src/components/features/workspace/worktree-delivery-dialog.tsx 使用 syncSessionsBlocked 显示同步专属提示，11 种 workspace 翻译同步新增；原删除提示保留。
未提交改动、同目标分支、目标 HEAD 校验、忽略文件保护及用户确认继续沿用现有流程。

复用既有状态语义和严格 tmux 查询，不引入新状态机或接口字段。相关 Git 验证在临时测试仓库执行，未对用户真实分支执行合并或变基。

实际测试和构建结果见[验证记录](./verify-idle-agent-worktree-sync.md)。
