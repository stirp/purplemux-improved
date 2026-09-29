---
page: mobile-navigation
title: 移动端工作区操作、Tab 改名与触摸拖拽
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 移动端工作区操作、Tab 改名与触摸拖拽

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 移动端工作区行内操作、上下文菜单、换行布局及子 Worktree 标识。
- Tab 改名弹窗；桌面与移动端统一 Tab/工作区拖拽行为。
- 长按拖拽与上下文菜单协调，避免一次触摸同时触发两种操作。
- 移动端补齐工作树交付和管理入口。

## 边界与约束

- 拖拽不能误开菜单，菜单不能吞掉正常点击。
- 桌面鼠标交互与触摸设备行为必须同时保留。

## 验收标准

- 触摸排序、菜单、改名互不干扰。
- 小屏长名称可读，工作树管理和交付入口可达。

## 实现依据

- [src/components/features/mobile/mobile-navigation-sheet.tsx](../../../../src/components/features/mobile/mobile-navigation-sheet.tsx)
- [src/components/features/mobile/mobile-workspace-actions.tsx](../../../../src/components/features/mobile/mobile-workspace-actions.tsx)
- [src/components/features/mobile/mobile-tab-header.tsx](../../../../src/components/features/mobile/mobile-tab-header.tsx)
- [src/components/features/mobile/mobile-workspace-tab-bar.tsx](../../../../src/components/features/mobile/mobile-workspace-tab-bar.tsx)
- [src/hooks/use-navigation-drag.ts](../../../../src/hooks/use-navigation-drag.ts)
- [src/hooks/use-touch-drag.ts](../../../../src/hooks/use-touch-drag.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/navigation-drag.test.ts](../../../../tests/unit/lib/navigation-drag.test.ts)
- [tests/unit/lib/touch-drag.test.ts](../../../../tests/unit/lib/touch-drag.test.ts)
- [tests/unit/lib/layout-tab-rename.test.ts](../../../../tests/unit/lib/layout-tab-rename.test.ts)
- [tests/unit/lib/mobile-workspace-expansion.test.ts](../../../../tests/unit/lib/mobile-workspace-expansion.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`9c20a09f`, `de6461f8`, `b5cce4f5`, `4c18f343`, `56637049`, `40121e7f`, `cdd22313` | DETAILED |
