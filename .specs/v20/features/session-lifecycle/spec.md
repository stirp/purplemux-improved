---
page: session-lifecycle
title: 历史会话删除与工作区会话清理
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-10-08
assignee: ''
---

# 历史会话删除与工作区会话清理

## 概述

删除与清理部分记录 fork 基线 `52140216` 之后、截至 `3637a357` 的已有实现，属于回补规格。Sessions 项目定位为 2026-10-07 新增需求，2026-10-08 复审收敛为仅历史入口触发；其实施与本次自动检查证据单独记录，不代表浏览器/实机验收通过。

## 主要功能

- [Sessions 导航同步侧边栏项目](../../requirements/session-workspace-navigation.md)：成功进入会话后切换项目列表、高亮工作区并展开目标分组。

- 工作区会话列表和全局 Sessions 支持移除历史项，并可同时删除 Claude/Codex 原始记录。
- 有原始会话 ID 时，确认框默认勾选同时删除原始记录；用户可取消，只移除历史项。
- 删除带空闲 Tab 的工作区时清理关联 Agent 会话，保留活动会话保护。

## 边界与约束

- 正在使用的原始会话受服务端保护。
- 默认勾选是已确认的产品决策，不能描述成默认只隐藏或要求先手动勾选。
- 会话记录清理不等于磁盘 Worktree 清理。
- 项目定位仅由 Sessions 历史入口触发；其他通知和移动端 Tab 导航不变。分组展开仅为临时显示，不修改持久化折叠偏好。

## 验收标准

- 已有会话、历史恢复和工作区重建均同步项目选择；同项目及其他路由入口行为一致，失败不提前切换侧边栏。

- 首次及再次打开确认框都恢复预期默认值，取消勾选仅移除历史。
- 活动会话删除受阻，空闲工作区清理不残留错误会话关联。

## 实现依据

- [src/hooks/use-session-navigation.ts](../../../../src/hooks/use-session-navigation.ts)
- [src/hooks/use-layout.ts](../../../../src/hooks/use-layout.ts)
- [src/hooks/use-sidebar-actions.ts](../../../../src/hooks/use-sidebar-actions.ts)
- [src/components/layout/sidebar.tsx](../../../../src/components/layout/sidebar.tsx)
- [src/components/features/workspace/notification-sheet.tsx](../../../../src/components/features/workspace/notification-sheet.tsx)

- [src/components/features/workspace/session-history-actions.tsx](../../../../src/components/features/workspace/session-history-actions.tsx)
- [src/lib/session-history.ts](../../../../src/lib/session-history.ts)
- [src/lib/delete-session.ts](../../../../src/lib/delete-session.ts)
- [src/lib/delete-codex-session.ts](../../../../src/lib/delete-codex-session.ts)
- [src/lib/workspace-sessions.ts](../../../../src/lib/workspace-sessions.ts)
- [src/pages/api/session-history.ts](../../../../src/pages/api/session-history.ts)
- [docs/11-decisions/2026-09-28-session-deletion-default.md](../../../../docs/11-decisions/2026-09-28-session-deletion-default.md)

## 已有测试索引

Sessions 项目定位测试本次已运行，结果见独立验证记录；其余删除与清理测试是历史覆盖索引，不表示本次运行。

- [tests/unit/lib/session-workspace-navigation.test.ts](../../../../tests/unit/lib/session-workspace-navigation.test.ts)

- [tests/unit/lib/session-history-api.test.ts](../../../../tests/unit/lib/session-history-api.test.ts)
- [tests/unit/lib/session-history-removal.test.ts](../../../../tests/unit/lib/session-history-removal.test.ts)
- [tests/unit/lib/delete-session.test.ts](../../../../tests/unit/lib/delete-session.test.ts)
- [tests/unit/lib/delete-codex-session.test.ts](../../../../tests/unit/lib/delete-codex-session.test.ts)
- [tests/unit/lib/workspace-delete.test.ts](../../../../tests/unit/lib/workspace-delete.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)
- [Sessions 项目定位实施记录](../../result/build-session-workspace-navigation.md)
- [Sessions 项目定位验证记录](../../result/verify-session-workspace-navigation.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`6155e1b1`, `554ff421`, `1da87ce5`, `1097835c` | DETAILED |
| 2026-10-07 | 补充 Sessions 导航同步项目列表、选择与分组展开 | DETAILED |
| 2026-10-08 | 限制定位为历史入口、复用选择处理器、分组临时展开及测试隔离修正 | DETAILED |
