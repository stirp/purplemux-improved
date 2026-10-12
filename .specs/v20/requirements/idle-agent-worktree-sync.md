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
