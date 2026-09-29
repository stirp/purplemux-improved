---
page: browser-recovery
title: 浏览器存储清理、翻译刷新与异常恢复
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 浏览器存储清理、翻译刷新与异常恢复

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 设置页支持清理浏览器本地存储、缓存、Service Worker 和可枚举的 IndexedDB。
- 刷新客户端翻译加载，提供 messages 接口避免旧翻译持续缓存。
- 应用级错误边界提供恢复界面，并保留设置入口。

## 边界与约束

- 浏览器数据清理不删除服务器 ~/.purplemux 中的工作区和会话数据。
- IndexedDB 不支持枚举或被其他页占用时不能声称全部数据库已删除。
- 一个清理步骤失败不应阻止其他独立步骤尝试。

## 验收标准

- 缓存与翻译更新生效；失败不会显示全成功。
- 渲染异常下仍能进入恢复操作。

## 实现依据

- [src/lib/clear-browser-storage.ts](../../../../src/lib/clear-browser-storage.ts)
- [src/components/features/settings/browser-storage-settings.tsx](../../../../src/components/features/settings/browser-storage-settings.tsx)
- [src/components/layout/app-error-boundary.tsx](../../../../src/components/layout/app-error-boundary.tsx)
- [src/lib/load-client-messages.ts](../../../../src/lib/load-client-messages.ts)
- [src/pages/api/browser-storage.ts](../../../../src/pages/api/browser-storage.ts)
- [src/pages/api/messages.ts](../../../../src/pages/api/messages.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/clear-browser-storage.test.ts](../../../../tests/unit/lib/clear-browser-storage.test.ts)
- [tests/unit/lib/browser-storage-api.test.ts](../../../../tests/unit/lib/browser-storage-api.test.ts)
- [tests/unit/lib/load-client-messages.test.ts](../../../../tests/unit/lib/load-client-messages.test.ts)
- [tests/unit/lib/messages-api.test.ts](../../../../tests/unit/lib/messages-api.test.ts)
- [tests/unit/lib/app-recovery-render.test.ts](../../../../tests/unit/lib/app-recovery-render.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`a9d601df`, `7eb23e54`, `43ef0357` | DETAILED |
