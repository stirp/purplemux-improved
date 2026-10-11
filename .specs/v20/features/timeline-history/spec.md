---
page: timeline-history
title: 按轮加载历史与长消息展开
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-10-10
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

- 0.5.2 会话列表元数据优化：Claude/Codex 缓存按完整文件路径隔离，以 mtime、ctime、size、dev、ino 判定有效性，不因 30 秒经过而重读未变化 JSONL。每次请求仍检查文件状态，追加、改写、替换及删除必须被识别。
- 缓存最多保留 2000 项，按最近使用淘汰；同一路径的并发解析合并，失败后允许重试，读取期间发生变化的结果不写入缓存。主动清缓存后旧请求不得回填。
- Codex 单次列表扫描的元数据加载并发最多 10，避免历史文件数量直接决定同时打开的文件数。消息元数据与统计读取分离，统计仍沿用原有尾部读取及缓存，临时失败不固化为消息缓存。返回字段、排序、目录范围、隐藏过滤及分页语义保持一致。
- 本轮不提前截断会话列表：无效 JSONL 和隐藏会话会影响总数与分页，先通过缓存降低重复解析成本。

- 分页边界按对话轮次，不等同于固定条目数。
- 必须区分 Codex 旧模式替换行为与按轮增量模式。

## 验收标准

- PERF-CACHE-01：超过 30 秒后未变化文件不再次解析；文件内容变化或删除后不会返回过期缓存。
- PERF-CACHE-02：同名不同路径隔离、并发读取合并、失败重试、读取期间变化、容量淘汰及清缓存竞态有回归覆盖。
- PERF-CACHE-03：Codex 单次扫描峰值并发不超过 10，列表字段、排序和过滤保持正确；统计读取失败后可恢复。
- PERF-CACHE-04：合成 50 个约 1 MiB 会话，记录冷读取、热读取及 31 秒后刷新耗时和文件扫描次数，前后比较。

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

0.5.2 新增性能与兼容回归：

- [tests/unit/lib/session-meta-cache.test.ts](../../../../tests/unit/lib/session-meta-cache.test.ts)
- [tests/unit/lib/codex-session-list.test.ts](../../../../tests/unit/lib/codex-session-list.test.ts)
- [tests/unit/lib/session-list-performance.test.ts](../../../../tests/unit/lib/session-list-performance.test.ts)
- [性能实施记录](../../result/build-performance-optimization.md)
- [性能验证记录](../../result/verify-performance-optimization.md)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`070bf519`, `1da87ce5` | DETAILED |
