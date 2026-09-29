---
page: timeline-history
title: 按轮加载历史与长消息展开
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 按轮加载历史与长消息展开

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- Claude/Codex 时间线按一个对话轮次加载历史，减少一次读取大量记录。
- 字节游标与 hasMore 协调历史分页和实时增量。
- 用户长消息支持折叠展开，改善长文本阅读。

## 边界与约束

- 分页边界按对话轮次，不等同于固定条目数。
- 必须区分 Codex 旧模式替换行为与按轮增量模式。

## 验收标准

- 加载多轮不重复、不遗漏轮次边界；大文件不一次全量加载。
- 长消息展开收起不改写原文。

## 实现依据

- [src/lib/jsonl-turn-reader.ts](../../../../src/lib/jsonl-turn-reader.ts)
- [src/lib/timeline-server.ts](../../../../src/lib/timeline-server.ts)
- [src/hooks/use-timeline.ts](../../../../src/hooks/use-timeline.ts)
- [src/pages/api/timeline/entries.ts](../../../../src/pages/api/timeline/entries.ts)
- [src/components/features/timeline/user-message-item.tsx](../../../../src/components/features/timeline/user-message-item.tsx)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/timeline-turn-pagination.test.ts](../../../../tests/unit/lib/timeline-turn-pagination.test.ts)
- [tests/unit/lib/session-parser-codex.test.ts](../../../../tests/unit/lib/session-parser-codex.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`070bf519`, `1da87ce5` | DETAILED |
