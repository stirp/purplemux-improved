---
page: agent-progress
title: Agent 状态栏与 Todo/Plan 进度
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Agent 状态栏与 Todo/Plan 进度

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 桌面及移动端展示 CLI 实际渲染的 Claude/Codex 状态栏，终端收起后仍可见。
- 状态栏按会话匹配，短暂重绘时保留最近有效内容。
- 统一 Claude TodoWrite、TaskCreate/TaskUpdate 和 Codex 计划进度，支持快照替换。
- 解析 exec 中直接传入列表的 tools.update_plan(...) 调用。

## 边界与约束

- 状态栏依赖真实 CLI 输出，不能推断未输出的用量数据。
- 计划依赖当前会话工具实际调用；不承诺解析任意动态 JavaScript 表达式。

## 验收标准

- 桌面与移动端使用当前会话内容，短暂重绘不闪空或串会话。
- 计划快照替换旧任务；支持约定的 exec 直接列表形式。

## 实现依据

- [src/components/features/workspace/agent-status-line.tsx](../../../../src/components/features/workspace/agent-status-line.tsx)
- [src/lib/claude-status-line.ts](../../../../src/lib/claude-status-line.ts)
- [src/lib/codex-status-line.ts](../../../../src/lib/codex-status-line.ts)
- [src/lib/codex-exec-plan.ts](../../../../src/lib/codex-exec-plan.ts)
- [src/lib/timeline-tasks.ts](../../../../src/lib/timeline-tasks.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/claude-status-line.test.ts](../../../../tests/unit/lib/claude-status-line.test.ts)
- [tests/unit/lib/codex-status-line.test.ts](../../../../tests/unit/lib/codex-status-line.test.ts)
- [tests/unit/lib/timeline-tasks.test.ts](../../../../tests/unit/lib/timeline-tasks.test.ts)
- [tests/unit/lib/session-parser-codex.test.ts](../../../../tests/unit/lib/session-parser-codex.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`a9d601df`, `88367f86` | DETAILED |
