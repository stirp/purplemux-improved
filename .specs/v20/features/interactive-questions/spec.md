---
page: interactive-questions
title: Claude/Codex 交互式问题卡片
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Claude/Codex 交互式问题卡片

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 统一 Claude 与 Codex 的交互式选项卡片样式。
- Codex 选项答案直接提交，不再先填入输入框等待第二次发送。
- 提交后保留所选答案，并从历史条目恢复已回答状态。

## 边界与约束

- 会话变化时拒绝旧卡片向新会话提交。
- 已提交答案必须可见，发送失败不伪装成完成。

## 验收标准

- Codex 回答只需一次提交，提交后不丢失选择。
- 历史回放恢复回答，Claude 与 Codex 样式一致。

## 实现依据

- [src/components/features/timeline/ask-user-question-item.tsx](../../../../src/components/features/timeline/ask-user-question-item.tsx)
- [src/lib/async-question-answers.ts](../../../../src/lib/async-question-answers.ts)
- [src/hooks/use-timeline.ts](../../../../src/hooks/use-timeline.ts)
- [src/types/timeline.ts](../../../../src/types/timeline.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/async-question-answers.test.ts](../../../../tests/unit/lib/async-question-answers.test.ts)
- [tests/unit/lib/input-queue-api.test.ts](../../../../tests/unit/lib/input-queue-api.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`58cd8488`, `08d4233e`, `88367f86` | DETAILED |
