---
page: claude-terminal-mode-detection
title: Terminal 视图下恢复 Claude 会话入口
status: DETAILED
created: 2026-10-17
updated: 2026-10-17
depends_on:
  - ../../../v8/features/panel-toggle/spec.md
  - ../../../v20/features/agent-runtime/spec.md
  - ../../../v19/features/codex-panel-ui/spec.md
---

# Terminal 视图下恢复 Claude 会话入口

## 用户需求

Claude 切到 Terminal 后，前台进程显示为 node，再打开移动端 View as 菜单只有 Start Claude / Start Codex，无法切回原会话。修复此问题。

## 范围与行为

- 增补面板切换基线：移动端和桌面端打开视图菜单前，复用 `/api/check-agent` 实时检测与 `applyAgentCheckResult` 状态更新，不仅依赖 tmux 前台命令或缓存状态。
- Claude 经 Node 包装器启动、前台命令仍为 node 时，只要现有检测确认 Claude 运行，菜单显示 Terminal / Chat；Chat 仅切回对应 Agent 面板，不发送启动或恢复命令，不改变 tmux 会话。
- 保留现有 Claude/Codex 后代进程识别、时间戳防旧响应覆盖、Agent 切换锁和布局保存机制；不修改服务端检测算法、工作状态或持久化格式。
- 检查确认进程退出后，Terminal 菜单显示 Start Claude / Start Codex；普通 Node 程序不能仅因进程名为 node 就被当成 Claude。
- 检测网络错误或非成功 HTTP 响应保留最近状态，菜单仍可打开；缺少 tmux 会话名不发起请求。检测等待最多 3 秒，包含请求及响应体读取；超时中止请求、保留最近状态并打开菜单，迟到响应不再写入状态。

## 验收标准

1. 移动端 Claude → Terminal → 打开菜单：即使缓存检测未知、前台为 node，实时返回 Claude 后显示 Chat；点击调用原面板切换回调，不派发启动事件。
2. 刷新后缓存缺失的 Terminal 同样可恢复 Claude/Codex 身份，无会话 ID 的启动中进程仍可切回 Chat。
3. 进程已退出或普通 Node 程序返回 running=false 后显示启动入口，不保留错误的 Chat 入口。
4. 网络失败、非成功响应和缺少会话名不清空已有身份；旧时间戳不得覆盖更新的检测结果。
5. 桌面端复用同一请求函数，保留现有开菜单检测行为。相关回归、完整 TypeScript、改动文件 ESLint 通过；记录构建与浏览器/实机验收的实际范围。
6. 请求或响应体读取一直挂起时，移动端及桌面端菜单均在 3 秒等待结束后可操作；请求被中止，已有 Agent 身份不被清空，超时后迟到的成功/退出结果不得更新状态；正常完成或失败后清理超时定时器。

审查修正依据：[PR #55 检测等待无上限](https://github.com/stirp/purplemux-improved/pull/55#discussion_r4302680219)。

见[任务](./task.md)与[实施和验证](./result.md)。
