---
page: worktree-lifecycle
title: Worktree 创建、接入与安全删除
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Worktree 创建、接入与安全删除

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 从工作区创建独立分支和 Git Worktree，并建立子工作区供 Agent 使用。
- 创建时可选择本地或远程基准分支，保留显式基准引用，并在交付时用于目标默认值。
- 管理界面发现仓库中已有工作树，包括终端创建的目录，并可接入 Purplemux。
- 删除前检查工作树状态、关联会话、改动、未跟踪文件和被忽略文件；默认保留分支。
- 可另行删除已合入指定目标分支的本地分支；被忽略文件需要列出并确认。

## 边界与约束

- 主工作树、锁定或状态未知的目录不得直接删除；活动会话与不安全改动需阻止删除。
- 移除子工作区与删除磁盘 Worktree 是不同操作。默认不 fetch、不删除分支。

## 验收标准

- 终端新建的工作树能够发现和接入。
- 未确认的忽略文件和变化后的快照阻止删除；分支默认保留。

## 实现依据

- [src/components/features/workspace/create-worktree-dialog.tsx](../../../../src/components/features/workspace/create-worktree-dialog.tsx)
- [src/components/features/workspace/manage-worktrees-dialog.tsx](../../../../src/components/features/workspace/manage-worktrees-dialog.tsx)
- [src/lib/git-worktree.ts](../../../../src/lib/git-worktree.ts)
- [src/lib/worktree-manager.ts](../../../../src/lib/worktree-manager.ts)
- [src/pages/api/workspace/worktrees.ts](../../../../src/pages/api/workspace/worktrees.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/git-worktree.test.ts](../../../../tests/unit/lib/git-worktree.test.ts)
- [tests/unit/lib/worktree-manager.test.ts](../../../../tests/unit/lib/worktree-manager.test.ts)
- [tests/unit/lib/worktree-api.test.ts](../../../../tests/unit/lib/worktree-api.test.ts)
- [tests/unit/lib/worktrees-api.test.ts](../../../../tests/unit/lib/worktrees-api.test.ts)
- [tests/unit/lib/worktree-session-safety.test.ts](../../../../tests/unit/lib/worktree-session-safety.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`a9d601df`, `9e14f341`, `196101d8`, `3060dd9a`, `554ff421` | DETAILED |
