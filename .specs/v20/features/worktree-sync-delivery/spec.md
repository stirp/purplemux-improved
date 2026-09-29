---
page: worktree-sync-delivery
title: Worktree 同步与 PR/MR 草稿交付
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Worktree 同步与 PR/MR 草稿交付

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 预览与目标分支的差异，显式 fetch，并支持 merge、rebase、冲突后的 continue/abort。
- 关联、刷新 GitHub PR 或 GitLab MR；通过已认证 gh/glab 创建同远程仓库内的草稿。
- 推送是独立确认步骤，发送预览过的提交；创建草稿前检查提交已发布及是否存在开放的 PR/MR。
- 桌面和移动端工作区提供交付与管理入口，交付目标按需加载；草稿表单根据远程自动识别平台。

## 边界与约束

- 同步不修改目标分支；不执行 force push。
- 草稿目前只支持同远程仓库分支，不支持跨 fork 草稿。
- 远程失败显示未知或未确认；远程创建成功但本地关联保存失败时仍保留链接。

## 验收标准

- 目标 HEAD 变化、未提交改动或会话冲突时拒绝不安全同步。
- 移动端与桌面入口可用；平台识别跟随所选远程。
- 冲突可继续或中止，推送与草稿创建分别确认。

## 实现依据

- [src/lib/worktree-sync.ts](../../../../src/lib/worktree-sync.ts)
- [src/lib/worktree-delivery.ts](../../../../src/lib/worktree-delivery.ts)
- [src/lib/worktree-draft.ts](../../../../src/lib/worktree-draft.ts)
- [src/components/features/workspace/worktree-delivery-dialog.tsx](../../../../src/components/features/workspace/worktree-delivery-dialog.tsx)
- [src/components/features/workspace/worktree-draft-form.tsx](../../../../src/components/features/workspace/worktree-draft-form.tsx)
- [src/components/features/workspace/workspace-delivery-button.tsx](../../../../src/components/features/workspace/workspace-delivery-button.tsx)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/worktree-tools.test.ts](../../../../tests/unit/lib/worktree-tools.test.ts)
- [tests/unit/lib/worktree-delivery.test.ts](../../../../tests/unit/lib/worktree-delivery.test.ts)
- [tests/unit/lib/worktree-actions-api.test.ts](../../../../tests/unit/lib/worktree-actions-api.test.ts)
- [tests/unit/lib/workspace-delivery-button.test.ts](../../../../tests/unit/lib/workspace-delivery-button.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`4d76c174`, `9b525d26`, `7b6b06f4`, `cdd22313`, `957994dd`, `8c341268` | DETAILED |
