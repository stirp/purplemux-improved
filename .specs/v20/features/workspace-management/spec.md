---
page: workspace-management
title: 工作区目录选择、布局与层级管理
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 工作区目录选择、布局与层级管理

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 目录浏览器支持选择服务器目录并批量创建工作区。
- Tab 支持改名；工作区和分组支持排序，空工作区可以恢复布局。
- 父子工作区按层级排列并继承所属分组；根据当前激活路径展开祖先，收起无关子工作区，同时处理孤儿和循环关系。

## 边界与约束

- 目录不可读、不存在或非绝对路径时返回对应错误。
- 隐藏子工作区只影响导航可见性，不删除工作区、磁盘目录或分支。

## 验收标准

- 多目录选择、空工作区恢复和 Tab 改名正确。
- 父子层级在分组排序后保持一致；循环和孤儿数据仍可访问。

## 实现依据

- [src/components/features/workspace/create-workspace-dialog.tsx](../../../../src/components/features/workspace/create-workspace-dialog.tsx)
- [src/hooks/use-layout.ts](../../../../src/hooks/use-layout.ts)
- [src/lib/workspace-store.ts](../../../../src/lib/workspace-store.ts)
- [src/lib/workspace-order.ts](../../../../src/lib/workspace-order.ts)
- [src/pages/api/workspace/directories.ts](../../../../src/pages/api/workspace/directories.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/workspace-directories.test.ts](../../../../tests/unit/lib/workspace-directories.test.ts)
- [tests/unit/lib/layout-empty-workspace.test.ts](../../../../tests/unit/lib/layout-empty-workspace.test.ts)
- [tests/unit/lib/layout-tab-rename.test.ts](../../../../tests/unit/lib/layout-tab-rename.test.ts)
- [tests/unit/lib/workspace-group-order.test.ts](../../../../tests/unit/lib/workspace-group-order.test.ts)
- [tests/unit/lib/workspace-visibility.test.ts](../../../../tests/unit/lib/workspace-visibility.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`58cd8488`, `6155e1b1`, `a9d601df`, `790e555b`, `5cec20aa` | DETAILED |
