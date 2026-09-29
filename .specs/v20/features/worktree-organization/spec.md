---
page: worktree-organization
title: Worktree 检索、空间统计与批量清理
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Worktree 检索、空间统计与批量清理

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 按分支和工作区名称检索工作树，结合最后打开时间组织空闲候选。
- 按需测量磁盘占用，区分受限扫描的部分结果。
- 批量清理先预览，逐项核对身份和文件快照，返回各项结果。

## 边界与约束

- 未知打开时间不能被推断为空闲。
- 测量不跟随符号链接，不把共享 Git 数据重复计入目录占用。
- 保护承载当前管理界面的工作区；预览后新增文件或 HEAD 变化需重新确认。

## 验收标准

- 搜索能匹配分支和工作区名称。
- 部分扫描与部分批量失败可见；预览本身不删除文件。

## 实现依据

- [src/lib/worktree-organization.ts](../../../../src/lib/worktree-organization.ts)
- [src/lib/worktree-filter.ts](../../../../src/lib/worktree-filter.ts)
- [src/lib/worktree-metadata.ts](../../../../src/lib/worktree-metadata.ts)
- [src/components/features/workspace/worktree-cleanup-dialog.tsx](../../../../src/components/features/workspace/worktree-cleanup-dialog.tsx)
- [src/pages/api/workspace/worktree-actions.ts](../../../../src/pages/api/workspace/worktree-actions.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/worktree-tools.test.ts](../../../../tests/unit/lib/worktree-tools.test.ts)
- [tests/unit/lib/worktree-actions-api.test.ts](../../../../tests/unit/lib/worktree-actions-api.test.ts)
- [tests/unit/lib/workspace-last-opened.test.ts](../../../../tests/unit/lib/workspace-last-opened.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`4d76c174`, `3060dd9a` | DETAILED |
