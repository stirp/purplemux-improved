# 接口规格

本需求不新增或变更 API、缓存、分页及实时同步契约。

- 名称保存：复用 workspace store 的 renameWorkspace(workspaceId, name)。
- 分组保存：复用 moveWorkspaceToGroup(workspaceId, groupId)，null 表示未分组。
- 两者沿用 PATCH /api/workspace/[workspaceId]，请求字段分别为 name 或 groupId。
- 创建 Git 子任务与工作树管理保留现有组件和请求，菜单排序不触发它们。
- 删除保留既有行为和确认流程。
- 菜单顺序仅由客户端渲染顺序决定，不写入工作区配置。
