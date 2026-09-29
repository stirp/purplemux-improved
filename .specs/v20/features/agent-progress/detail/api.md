# Agent 状态栏与 Todo/Plan 进度：接口与数据

## 接口或内部通道

- /api/claude/status-line 与 /api/codex/status-line 提供状态栏信息。
- session-parser、session-parser-codex、codex-exec-plan 与 timeline-tasks 负责进度归一化。

## 数据与执行边界

- 状态栏依赖真实 CLI 输出，不能推断未输出的用量数据。
- 计划依赖当前会话工具实际调用；不承诺解析任意动态 JavaScript 表达式。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
