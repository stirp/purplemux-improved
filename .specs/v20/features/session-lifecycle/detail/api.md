# 历史会话删除与工作区会话清理：接口与数据

## 接口或内部通道

- DELETE /api/session-history 负责历史移除及可选原始记录删除。
- /api/timeline/sessions 与 /api/codex/sessions 查询结果过滤已隐藏记录。
- /api/workspace/[workspaceId] 删除路径联动 workspace-sessions 与会话清理逻辑。

## 数据与执行边界

- 正在使用的原始会话受服务端保护。
- 默认勾选是已确认的产品决策，不能描述成默认只隐藏或要求先手动勾选。
- 会话记录清理不等于磁盘 Worktree 清理。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
