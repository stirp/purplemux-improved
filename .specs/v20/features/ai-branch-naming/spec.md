---
page: ai-branch-naming
title: AI 分支名生成与分支快速筛选
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# AI 分支名生成与分支快速筛选

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 根据需求描述生成分支名，设置中可配置生成提示词及 provider。
- 创建工作树时可快速筛选基准分支。
- 文本生成隔离运行并禁用工具，避免将命名请求变成仓库操作；支持 Claude 不在直接 PATH 时的登录 shell 回退。

## 边界与约束

- 当前 Codex CLI 无法保证无工具文本生成；选择 Codex 时接口返回 409 codexTextOnlyUnavailable，需使用 Claude Code。
- 生成名称不等于创建分支；实际创建仍由 Worktree 流程验证。

## 验收标准

- 生成结果可编辑，配置被读取，分支筛选正确。
- 禁用工具约束、超时和进程清理成立；Codex 不被伪装成支持该模式。

## 实现依据

- [src/components/features/settings/branch-name-settings.tsx](../../../../src/components/features/settings/branch-name-settings.tsx)
- [src/components/features/workspace/create-worktree-dialog.tsx](../../../../src/components/features/workspace/create-worktree-dialog.tsx)
- [src/lib/agent-text.ts](../../../../src/lib/agent-text.ts)
- [src/lib/branch-name-prompt.ts](../../../../src/lib/branch-name-prompt.ts)
- [src/pages/api/workspace/generate-branch-name.ts](../../../../src/pages/api/workspace/generate-branch-name.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/branch-name-config.test.ts](../../../../tests/unit/lib/branch-name-config.test.ts)
- [tests/unit/lib/branch-name-prompt.test.ts](../../../../tests/unit/lib/branch-name-prompt.test.ts)
- [tests/unit/lib/generate-branch-name-api.test.ts](../../../../tests/unit/lib/generate-branch-name-api.test.ts)
- [tests/unit/lib/agent-text-process.test.ts](../../../../tests/unit/lib/agent-text-process.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`d73da852`, `e5fdb3c9`, `342c2283` | DETAILED |
