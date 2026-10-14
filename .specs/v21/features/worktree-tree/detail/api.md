# 接口

导航调整不增加持久字段或服务端 API。树轨道从 parentWorkspaceId 和可视排序派生；根管理按钮复用原有仓库发现与空状态。useTouchDrag 仅在标记为支持菜单的项目行启用静止长按分流，最终仍派发既有 contextmenu 或 HTML drag/drop 事件。

复用 GET /api/workspace/worktrees 获取路径、仓库及工作区关联；POST /api/workspace/worktree-actions inspectSync、merge。merge 仍校验工作树快照、目标 HEAD、会话与脏状态；允许主工作树作为合并目标，保留其他 blocker。计数仅基于本地 refs，不自动 fetch。

关系匹配在客户端先选择关联子工作区的 repository，再在该 repository.worktrees 中匹配父工作区；两端快照的 repositoryId 必须一致。此修正不新增接口、字段或 CLI 参数。

整合仅复用现有仓库管理接口（GET/POST/DELETE /api/workspace/worktrees、POST /api/workspace/worktree-actions），不引入新的协议；接管、测量、清理与删除的保护条件保持不变。

提交后交付复用 GET /api/workspace/worktrees、POST /api/workspace/worktree-actions 的 inspectSync、pushBranch、generateDraft、createDraft，以及已有 POST /api/git/commit；不新增自动提交或自动推送接口。会话工作区与提交目录匹配后才能发起工作树操作。

审查修正：inspectSync 对主工作树照常返回 main blocker；merge 允许主工作树为 item，rebase、continue、abort 不允许。CLI 的 worktree merge 将 item 对应工作树作为执行目录，targetRef/targetHead 为合入的分支，接口无需新增字段。

PR #37：pushBranch/createDraft 的发布检查忽略 main，与发布表单一致；inspectSync 和仓库列表仍报告该标记，其他 blocker、快照与远端校验不变。只放宽发布操作，不在通用工作树解析或同步检查中移除 main。CLI worktree push/create-draft 自动使用同一规则。

Git 面板新增 ICommitRepository 客户端快照（directory、branch、head），由打开时的面板状态传入共享弹窗；仅初始提交检查返回 noChanges 时作为已有提交发布依据。GitCommitDelivery 要求目录、分支与 HEAD，校验 overview 和 inspectSync 返回值。复用既有提交及交付接口；CLI 命令、参数和服务端协议无需为快捷入口调整。
