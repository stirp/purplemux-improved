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
