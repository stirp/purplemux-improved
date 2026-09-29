---
page: session-lifecycle
title: 历史会话删除与工作区会话清理
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 历史会话删除与工作区会话清理

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 工作区会话列表和全局 Sessions 支持移除历史项，并可同时删除 Claude/Codex 原始记录。
- 有原始会话 ID 时，确认框默认勾选同时删除原始记录；用户可取消，只移除历史项。
- 删除带空闲 Tab 的工作区时清理关联 Agent 会话，保留活动会话保护。

## 边界与约束

- 正在使用的原始会话受服务端保护。
- 默认勾选是已确认的产品决策，不能描述成默认只隐藏或要求先手动勾选。
- 会话记录清理不等于磁盘 Worktree 清理。

## 验收标准

- 首次及再次打开确认框都恢复预期默认值，取消勾选仅移除历史。
- 活动会话删除受阻，空闲工作区清理不残留错误会话关联。

## 实现依据

- [src/components/features/workspace/session-history-actions.tsx](../../../../src/components/features/workspace/session-history-actions.tsx)
- [src/lib/session-history.ts](../../../../src/lib/session-history.ts)
- [src/lib/delete-session.ts](../../../../src/lib/delete-session.ts)
- [src/lib/delete-codex-session.ts](../../../../src/lib/delete-codex-session.ts)
- [src/lib/workspace-sessions.ts](../../../../src/lib/workspace-sessions.ts)
- [src/pages/api/session-history.ts](../../../../src/pages/api/session-history.ts)
- [docs/11-decisions/2026-09-28-session-deletion-default.md](../../../../docs/11-decisions/2026-09-28-session-deletion-default.md)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

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

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`6155e1b1`, `554ff421`, `1da87ce5`, `1097835c` | DETAILED |
