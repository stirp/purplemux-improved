---
page: terminal-rendering
title: 终端流控与移动端视口
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 终端流控与移动端视口

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 浏览器解析端对终端输出进行排队和确认，服务端依据消费进度进行背压控制。
- 终端页面提供加载反馈。
- 移动端依据 visual viewport 调整终端可视高度及按键栏，改善软键盘遮挡。

## 边界与约束

- 收到 WebSocket 数据不等同于终端已经解析完成，确认不能过早。
- 连接关闭或重建时需清理旧队列与确认状态，避免错误作用于新连接。

## 验收标准

- 高吞吐输出下消费确认与暂停/恢复配合，无无界积压。
- 软键盘和窗口变化后终端尺寸、按键栏位置正确。

## 实现依据

- [src/lib/terminal-protocol.ts](../../../../src/lib/terminal-protocol.ts)
- [src/lib/terminal-write-queue.ts](../../../../src/lib/terminal-write-queue.ts)
- [src/lib/terminal-server.ts](../../../../src/lib/terminal-server.ts)
- [src/hooks/use-terminal-websocket.ts](../../../../src/hooks/use-terminal-websocket.ts)
- [src/hooks/use-visual-viewport.ts](../../../../src/hooks/use-visual-viewport.ts)
- [src/components/features/workspace/workspace-page-loading.tsx](../../../../src/components/features/workspace/workspace-page-loading.tsx)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/terminal-backpressure.test.ts](../../../../tests/unit/lib/terminal-backpressure.test.ts)
- [tests/unit/lib/terminal-write-queue.test.ts](../../../../tests/unit/lib/terminal-write-queue.test.ts)
- [tests/unit/lib/terminal-websocket-flow.test.ts](../../../../tests/unit/lib/terminal-websocket-flow.test.ts)
- [tests/unit/lib/visual-viewport.test.ts](../../../../tests/unit/lib/visual-viewport.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`281dc477`, `b1e482e7` | DETAILED |
