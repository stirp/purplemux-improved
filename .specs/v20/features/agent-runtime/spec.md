---
page: agent-runtime
title: Agent 启动、环境配置与会话绑定恢复
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# Agent 启动、环境配置与会话绑定恢复

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 改善嵌套 shell 中的 Claude 进程识别、preflight 和 TUI 就绪检测。
- 设置页配置 Codex 启动环境变量，由 launcher 应用于新进程。
- 启动阶段 unknown 状态恢复与前端输入 gating 对齐。
- Codex review 子会话不覆盖根会话绑定；launcher 调整受支持的启动参数并禁用启动更新检查。
- 安装 WebSocket hook 改善连接管理。
- shell 环境继承 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY、NO_PROXY 及小写对应变量，使子进程沿用代理配置。

## 边界与约束

- 环境变量只作用于新启动进程，不追改运行中的进程环境。
- review 子会话与根会话身份需区分，不能因子会话 hook 切换面板绑定。

## 验收标准

- 嵌套 shell 下能识别 Claude；初始 unknown 状态正确收敛。
- Codex 新进程获得环境变量，review 期间保留根会话绑定。

## 实现依据

- [src/lib/providers/claude/session-detection.ts](../../../../src/lib/providers/claude/session-detection.ts)
- [src/lib/claude-tui-ready-detector.ts](../../../../src/lib/claude-tui-ready-detector.ts)
- [src/lib/providers/codex/index.ts](../../../../src/lib/providers/codex/index.ts)
- [src/lib/providers/codex/hook-session.ts](../../../../src/lib/providers/codex/hook-session.ts)
- [src/lib/status-manager.ts](../../../../src/lib/status-manager.ts)
- [src/lib/agent-environment.ts](../../../../src/lib/agent-environment.ts)
- [src/lib/shell-env.ts](../../../../src/lib/shell-env.ts)
- [src/hooks/use-install-websocket.ts](../../../../src/hooks/use-install-websocket.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/claude-session-detection.test.ts](../../../../tests/unit/lib/claude-session-detection.test.ts)
- [tests/unit/lib/claude-preflight.test.ts](../../../../tests/unit/lib/claude-preflight.test.ts)
- [tests/unit/lib/codex-launcher-environment.test.ts](../../../../tests/unit/lib/codex-launcher-environment.test.ts)
- [tests/unit/lib/codex-hook-session.test.ts](../../../../tests/unit/lib/codex-hook-session.test.ts)
- [tests/unit/lib/codex-review-state.test.ts](../../../../tests/unit/lib/codex-review-state.test.ts)
- [tests/unit/lib/install-websocket.test.ts](../../../../tests/unit/lib/install-websocket.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`58cd8488`, `88367f86`, `636024b3`, `443d7c0b`, `4a7cc7ac`, `aa1899a1`, `4b42f164`, `d1f8b449` | DETAILED |
