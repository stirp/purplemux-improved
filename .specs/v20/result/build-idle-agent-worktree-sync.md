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

## PR #30 Review 修复

- [P1：inactive Agent 前台命令误放行](https://github.com/stirp/purplemux-improved/pull/30#discussion_r4249326793)：areSessionsIdle 对普通终端与 inactive Agent 同时要求 idle 状态和 SAFE_SHELLS 中的实际前台命令；同步传入的严格 pane 快照优先于缓存 currentProcess，关联 pane 缺失时拒绝。
- [P2：状态刷新吞掉 tmux 错误](https://github.com/stirp/purplemux-improved/pull/30#discussion_r4249326800)：poll 增加可选的只读 pane 快照参数，同步将严格查询成功的快照传入刷新及空闲校验，避免重复非严格查询将错误转换为空 map。定时 poll() 保持既有查询路径。
- docs/STATUS.md 同步维护状态刷新和 Worktree 安全判断约定；新增真实 StatusManager 的快照回归，补充前台构建、编辑器、缺失 pane、缓存冲突及严格查询后续失败的保护测试。

共享空闲判断的 shell 校验也作用于 Worktree 删除，属于加强保护；没有放宽删除条件。
