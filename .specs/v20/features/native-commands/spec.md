---
page: native-commands
title: Web 输入联动 CLI 原生命令菜单
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Web 输入联动 CLI 原生命令菜单

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- Web 输入框中的 / 操作联动当前 Claude/Codex CLI 原生命令菜单。
- 展开终端完成选择，使用该会话真实可用的命令。
- 跟踪原生命令完成状态，协调终端与输入栏。

## 边界与约束

- 可用命令以当前 CLI 版本和会话为准。
- 不把命令菜单内容固化为 Web 端维护的全量列表。

## 验收标准

- Claude/Codex 均能进入各自原生菜单。
- 菜单完成后输入状态正确恢复，不重复发送命令。

## 实现依据

- [src/components/features/workspace/native-command-toolbar.tsx](../../../../src/components/features/workspace/native-command-toolbar.tsx)
- [src/hooks/use-native-commands.ts](../../../../src/hooks/use-native-commands.ts)
- [src/lib/native-command-completion.ts](../../../../src/lib/native-command-completion.ts)
- [src/hooks/use-terminal.ts](../../../../src/hooks/use-terminal.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/native-command-completion.test.ts](../../../../tests/unit/lib/native-command-completion.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`a9d601df`, `2a5ee2bd` | DETAILED |
