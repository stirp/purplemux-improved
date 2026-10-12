# 空闲 Agent 允许同步分支

- 日期：2026-10-12
- 规格：[worktree-sync-delivery](../features/worktree-sync-delivery/spec.md)

## 用户需求

Claude/Codex 已启动但没有任务执行时，允许将目标分支合并到当前分支。
存在进程或关联会话本身不应阻止同步。

## 行为与验收

- IA-01：同步预览及 merge/rebase、continue/abort 复用 StatusManager.areSessionsIdle 判定；所有关联会话均空闲时移除 sessions 阻断，不关闭或重启 Agent。
- IA-02：busy、needs-input、unknown、权限请求、压缩上下文、运行中的普通终端、无法识别会话以及额外 tmux pane 仍阻断；状态刷新或严格 tmux 查询失败时拒绝同步。
- IA-03：服务端执行前刷新状态，并重新校验工作树 HEAD、分支、未提交文件和关联会话；预览后开始任务或产生文件改动时不能执行 Git 同步。
- IA-04：未提交文件、同分支目标、目标 HEAD 变化、忽略文件覆盖等原有保护不变。删除 Worktree 的保护不变。
- IA-05：桌面与移动端共用现有 blockers 与确认流程；用户点击刷新后更新按钮状态。截图中的 dirty 阻断仍需先提交或移走改动。

自动化验证使用合成状态和临时 Git 仓库，不操作用户真实分支。

## PR #30 Review 补充

- IA-06（P1）：inactive Agent 和普通终端即使 terminalStatus 为 idle，也必须通过实际前台进程确认是 SAFE_SHELLS 中的 shell；构建、编辑器和未知进程仍阻断。同步采用当前严格 pane 快照，不能使用过期 currentProcess 覆盖快照。
- IA-07（P2）：同步将严格查询成功的 pane 快照传入 StatusManager.poll 和空闲判断，刷新不再重复调用吞错的非严格 pane 查询。严格查询失败、缺少关联 pane 或状态刷新失败，均不移除 sessions 阻断。
- 定时轮询默认行为保持兼容；共享空闲判断对 inactive/shell 的验证同时修正删除流程的误判，不放宽删除保护。
