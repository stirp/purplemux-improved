---
page: queued-input
title: 排队输入、立即提交与长文本粘贴
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 排队输入、立即提交与长文本粘贴

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- Web 输入默认排队；Agent 忙碌时保留后续消息，空闲后按顺序发送。
- 支持立即提交和移除排队项，界面显示后端具体错误。
- 长文本通过可靠的 tmux 粘贴路径发送，避免仅依赖 send-keys 导致截断或控制字符问题。

## 边界与约束

- inactive/unknown 状态不能普通入队；无效消息、队列已满和会话变化需要返回错误。
- 立即回答必须绑定当前 Agent 会话，不能发送到已切换的会话。

## 验收标准

- 忙碌期间按序保留，空闲后按序发送。
- 后端错误可见；长文本及换行不丢失。

## 实现依据

- [src/components/features/workspace/web-input-bar.tsx](../../../../src/components/features/workspace/web-input-bar.tsx)
- [src/hooks/use-input-queue.ts](../../../../src/hooks/use-input-queue.ts)
- [src/lib/input-queue.ts](../../../../src/lib/input-queue.ts)
- [src/lib/input-queue-server.ts](../../../../src/lib/input-queue-server.ts)
- [src/lib/tmux.ts](../../../../src/lib/tmux.ts)
- [src/pages/api/input-queue.ts](../../../../src/pages/api/input-queue.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/input-queue.test.ts](../../../../tests/unit/lib/input-queue.test.ts)
- [tests/unit/lib/input-queue-api.test.ts](../../../../tests/unit/lib/input-queue-api.test.ts)
- [tests/unit/lib/input-queue-server.test.ts](../../../../tests/unit/lib/input-queue-server.test.ts)
- [tests/unit/lib/tmux-paste.test.ts](../../../../tests/unit/lib/tmux-paste.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`6155e1b1`, `08d4233e`, `11423ec7`, `aa1899a1`, `1da87ce5` | DETAILED |
