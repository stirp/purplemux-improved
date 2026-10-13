# 工作区目录选择、布局与层级管理：接口与数据

## 接口或内部通道

- GET /api/workspace/directories：directory 为可选绝对路径，默认用户主目录，返回当前目录、父目录和子目录列表。
- 工作区排序、分组和布局通过现有 workspace/layout store 保存，不新建独立持久化系统。

## 数据与执行边界

- 目录不可读、不存在或非绝对路径时返回对应错误。
- 隐藏子工作区只影响导航可见性，不删除工作区、磁盘目录或分支。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。

## 2026-10-13 工作状态管理

遵循[Sessions 与 Workspace 工作状态需求](../../../requirements/session-task-status.md)。人工状态与运行状态分离，分类折叠及 Workspace 汇总共享同一状态规则。状态和折叠偏好保存于 workspaces.json 的 sessionWorkflow，GET /api/workspace 读取，PATCH /api/session-workflow 严格校验并按字段更新，通过 workspace 广播同步。

Review 修复：sessionWorkflow 增加 sessions 持久索引和 tabBindings 首次绑定记录；GET Workspace 回补当前 Tab/保留历史并迁移 fallback，历史新增在裁剪前更新索引，显式删除同步清除索引。同步连接 onopen 补拉 Workspace，历史禁用导航按会话身份判断。完整约束见上链需求的 Review 修复约定。
