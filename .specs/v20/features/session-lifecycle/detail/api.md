# 历史会话删除与工作区会话清理：接口与数据

## 接口或内部通道

- Sessions 历史入口调用 `navigateToSession`，完成 hydrate 和服务端布局查询后，通过 `navigateToTabOrCreate` 的显式 `onNavigate` 回调定位项目。无代理 ID 的失效 Tab 不创建新 Tab、不定位项目。
- 通用 `navigateToTab` 和默认 `navigateToTabOrCreate` 不包含 reveal 行为。其他通知、web-push 和移动端 Tab 导航保持原行为。
- 使用共享 `selectWorkspace`，优先调用桌面/移动端注册处理器，保留原切换记账和元数据重置。激活项目沿用现有持久化写入，Projects 标签沿用 localStorage；不新增接口、配置字段或历史数据迁移。
- 临时目标保存在 `useSessionNavigation`，侧边栏按目标祖先的 groupId 派生展开状态；不调用 `toggleGroupCollapsed`，不发出分组 PATCH，不修改磁盘中的 collapsed。离开目标项目或手动收起后清除临时状态。

- DELETE /api/session-history 负责历史移除及可选原始记录删除。
- /api/timeline/sessions 与 /api/codex/sessions 查询结果过滤已隐藏记录。
- /api/workspace/[workspaceId] 删除路径联动 workspace-sessions 与会话清理逻辑。

## 数据与执行边界

- 正在使用的原始会话受服务端保护。
- 默认勾选是已确认的产品决策，不能描述成默认只隐藏或要求先手动勾选。
- 会话记录清理不等于磁盘 Worktree 清理。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。

## 2026-10-13 工作状态管理

遵循[Sessions 与 Workspace 工作状态需求](../../../requirements/session-task-status.md)。人工状态与运行状态分离，分类折叠及 Workspace 汇总共享同一状态规则。状态和折叠偏好保存于 workspaces.json 的 sessionWorkflow，GET /api/workspace 读取，PATCH /api/session-workflow 严格校验并按字段更新，通过 workspace 广播同步。

Review 修复：sessionWorkflow 增加 sessions 持久索引和 tabBindings 首次绑定记录；GET Workspace 回补当前 Tab/保留历史并迁移 fallback，历史新增在裁剪前更新索引，显式删除同步清除索引。同步连接 onopen 补拉 Workspace，历史禁用导航按会话身份判断。完整约束见上链需求的 Review 修复约定。

第二轮 Review：删除标记 sessionWorkflow.deleted 在写锁内持久化，并在回补中读取 hidden-sessions；无轮次索引单独保存 navigation 恢复目标，按原生身份导航、判断当前会话和提供删除入口。详见状态管理需求第二轮约定。

第三轮 Review：删除身份仍消费首次绑定 fallback 并记录绑定，不迁移人工状态；无轮次会话使用 DOM 菜单触发器，验收右键和长按。详见状态管理需求第三轮约定。
