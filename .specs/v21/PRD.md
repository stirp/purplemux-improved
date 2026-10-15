# v21 需求汇总

v21 是 0.5.2 发布后的规格版本；[v20 历史规格](../v20/PRD.md)保持原有版本与验收记录。
规格版本与 npm 包版本分别维护。

本文件保留已有需求汇总。新增需求按[开发规范](../../AGENTS.md)独立维护在 `.specs/v22/changes/<requirement-id>/`，无需更新本表或版本任务表。
使用 `rg --files --hidden ".specs/v22/changes"` 发现新需求；v21 已有需求的后续进度与证据仍在其专属文档维护，下表不是完整的实时索引。

## 功能索引

| 需求 | 功能规格 | 进度 |
| --- | --- | --- |
| [下一版版本准备、暂停 Electron 自动发布及 CI 冻结安装修复](./requirements/next-release.md) | [发布元数据](./features/release-metadata/spec.md) | 见[任务表](./task.md) |
| [工作区视口滚动约束](./requirements/touch-viewport-scroll.md) | [工作区视口](./features/workspace-viewport/spec.md) | 见[任务表](./task.md) |
| [Agent 会话标题同步](./requirements/agent-session-titles.md) | [Agent 会话标题](./features/agent-session-titles-spec.md) | 见[任务表](./task.md) |
| [Sessions 查询](./requirements/session-search.md) | [Sessions 查询](./features/session-search/spec.md) | 见[任务表](./task.md) |
| [项目 Worktree 父子关系与同步、根入口与导航手势](./requirements/worktree-tree.md) | [关系树](./features/worktree-tree/spec.md) | 见[任务表](./task.md)，含 PR #38 交互修正 |
