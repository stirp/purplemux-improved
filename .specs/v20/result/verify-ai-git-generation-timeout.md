# AI 提交信息生成超时：验证记录

日期：2026-10-05。

## 自动化验收

6 个相关 Vitest 文件、52 项测试通过：git-commit-request、git-commit-dialog、git-commit、git-commit-api、agent-text、agent-text-process。

- HTML 408/504 显示超时错误码；非 JSON 502/200 显示请求错误。
- 正常响应与结构化服务端错误兼容。
- 卡住的请求 150 秒后中止，可手动重试；取消及请求结束清理计时器。
- 弹窗生成失败保留标题、正文与快照，恢复按钮，重新生成可成功替换。
- 实际提交网络中断、HTML 错误或超时不自动重试，提示检查结果。
- Claude 执行超时保留类型，清理临时目录；生成超时返回 504，不改 HEAD 或暂存区。

完整 `pnpm exec tsc --noEmit`、改动文件 ESLint、`pnpm exec next build`、`pnpm build:server` 通过。
8 个关联 Markdown 文件检查与 `git diff --check` 通过。

## 验证限制

浏览器/生产网关实测未执行；使用 jsdom 交互测试与模拟 HTTP 响应回归截图中的故障。
保持同步生成，代理仍可能在 AI 完成前返回 504；本次保证明确提示与可恢复状态，不承诺消除网关超时。
