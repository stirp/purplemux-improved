---
page: mobile-navigation
title: 移动端工作区操作、Tab 改名与触摸拖拽
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-10-13
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
- [空工作区选择](../../requirements/mobile-empty-workspace-selection.md)：点击工作区行同时选中项目，使无 Tab 项目可以进入新建 Tab 流程。

## 边界与约束

2026-10-14 增量以 [v21 根入口与导航层级](../../../v21/requirements/worktree-tree.md)为准：项目触摸布局隐藏齿轮；350ms 后移动拖动，650ms 静止打开菜单。Tab 拖动不变，短按/滚动/取消与点击穿透均需回归验证。

- 拖拽不能误开菜单，菜单不能吞掉正常点击。
- 桌面鼠标交互与触摸设备行为必须同时保留。

## 验收标准

- 触摸排序、菜单、改名互不干扰。
- 小屏长名称可读，工作树管理和交付入口可达。
- 空工作区与有 Tab 工作区均可通过工作区行切换，展开/收起及 Tab 导航保持可用；新 Tab 归属当前所选项目。
- 跨页面且没有注册选择处理器时，切换前同步清空旧布局，避免目标请求完成前操作旧 pane；重复选择当前项目保留布局。

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
