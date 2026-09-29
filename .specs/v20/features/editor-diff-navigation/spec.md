---
page: editor-diff-navigation
title: 编辑器文件跳转与差异浏览体验
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 编辑器文件跳转与差异浏览体验

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 扩展编辑器远程连接和带行列位置的文件链接，统一打开目标逻辑。
- 时间线、计划和差异界面的文件入口支持编辑器定位。
- 差异视图模式复用持久化逻辑；文件默认展开行为修正，稳定标识防止刷新错配。
- 分屏提示读取实际配置的快捷键。

## 边界与约束

- 远程 Web 访问本地编辑器受预设与目标校验限制；不允许任意危险 URL。
- 差异文件标识不能因列表顺序或展开行为变化而错配。

## 验收标准

- 远程目录和行列链接正确编码，非法目标不可打开。
- 刷新差异不会自动展开全部文件；快捷键显示跟随配置。

## 实现依据

- [src/lib/editor-url.ts](../../../../src/lib/editor-url.ts)
- [src/lib/open-editor.ts](../../../../src/lib/open-editor.ts)
- [src/components/features/timeline/editor-file-link.tsx](../../../../src/components/features/timeline/editor-file-link.tsx)
- [src/components/features/workspace/diff-file-list.tsx](../../../../src/components/features/workspace/diff-file-list.tsx)
- [src/hooks/use-diff-view-mode.ts](../../../../src/hooks/use-diff-view-mode.ts)
- [src/components/features/workspace/content-header.tsx](../../../../src/components/features/workspace/content-header.tsx)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/editor-url.test.ts](../../../../tests/unit/lib/editor-url.test.ts)
- [tests/unit/lib/editor-file-link.test.ts](../../../../tests/unit/lib/editor-file-link.test.ts)
- [tests/unit/lib/split-shortcuts.test.ts](../../../../tests/unit/lib/split-shortcuts.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`e1e2ee05`, `bdc766a6`, `99a361a2`, `ae91dc50` | DETAILED |
