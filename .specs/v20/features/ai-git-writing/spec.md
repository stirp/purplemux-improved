---
page: ai-git-writing
title: AI 提交信息、PR/MR 文案与提交确认
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# AI 提交信息、PR/MR 文案与提交确认

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 为仓库全部可提交改动生成可编辑的提交标题和正文，支持保存自定义生成提示词。
- 预览用私有索引，不改写用户暂存区；确认提交时校验目录、分支、HEAD 和内容树快照。
- 提交覆盖已暂存、未暂存及未跟踪但未被忽略的文件，仓库子目录入口仍以整个仓库为范围。
- 基于相对所选目标分支的已提交变更生成 PR/MR 标题和描述，支持单独配置提示词。

## 边界与约束

- 文案生成使用 Claude 无工具模式；模型返回内容须通过结构和长度校验。
- PR/MR 生成不纳入未提交内容；超出证据上限时标记截断，不编造测试结果。
- 快照过期、冲突、Git 操作中或索引锁冲突需阻止提交；提交完成后 hook 异常不得诱导重复提交。

## 验收标准

- 预览不改变暂存区，确认后内容与预览快照一致。
- 自定义提示词生效，生成失败不提交、不推送。
- 草稿文案取自已提交差异，脏工作区内容不混入。

## 实现依据

- [src/lib/git-commit.ts](../../../../src/lib/git-commit.ts)
- [src/lib/git-generation-prompts.ts](../../../../src/lib/git-generation-prompts.ts)
- [src/lib/worktree-draft-generation.ts](../../../../src/lib/worktree-draft-generation.ts)
- [src/components/features/workspace/git-commit-dialog.tsx](../../../../src/components/features/workspace/git-commit-dialog.tsx)
- [src/components/features/settings/git-generation-prompt-settings.tsx](../../../../src/components/features/settings/git-generation-prompt-settings.tsx)
- [src/pages/api/git/commit.ts](../../../../src/pages/api/git/commit.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/git-commit.test.ts](../../../../tests/unit/lib/git-commit.test.ts)
- [tests/unit/lib/git-commit-api.test.ts](../../../../tests/unit/lib/git-commit-api.test.ts)
- [tests/unit/lib/git-generation-prompts.test.ts](../../../../tests/unit/lib/git-generation-prompts.test.ts)
- [tests/unit/lib/worktree-tools.test.ts](../../../../tests/unit/lib/worktree-tools.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`9b525d26`, `2a5ee2bd`, `99a361a2` | DETAILED |
