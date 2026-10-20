# v0.5.8 实施与验证记录

## 实施

- 发布前 main 为 199a7b30，与 origin/main 一致，工作区干净；npm latest 和 GitHub 最新 Release 均为 0.5.7，本地无 v0.5.8 标签。
- 沿用既有发布工作流，不新增产品逻辑或打包规则（KISS/YAGNI/DRY）。
- 已执行 `npm version 0.5.8 --no-git-tag-version`；package.json 仅版本变更，锁文件未改动。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端 Node 24 验证结果待记录。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 远端 v0.5.8 标签不存在，GitHub Release 返回未找到，registry 的 0.5.8 返回 HTTP 404。
- 首轮 `pnpm test` 与静态检查同时运行，终端 UI、会话状态 UI、64 MiB 终端解析用例超过默认超时。机器为 4 个逻辑 CPU、当时负载约 9；主动中断本次测试以降低并发，退出 130，不记为通过。
- 第二轮 `pnpm exec vitest run --maxWorkers=2`：220 文件、2130 用例通过；2 文件、14 用例跳过；terminal-keys-ui 首个用例超过 5000ms，导致后续 act 状态未收敛，合计该文件 10 项失败。
- 静态检查结束后 `pnpm exec vitest run tests/unit/lib/terminal-keys-ui.test.ts --maxWorkers=1`：10 项全部通过。未修改测试断言或超时阈值。
- 最终 `pnpm exec vitest run --maxWorkers=1`：221 文件、2140 用例通过，2 文件、14 用例跳过，退出 0。日志包含 jsdom 未实现页面导航的提示，无失败断言。
- `pnpm test:cli`：153 项全部通过，退出 0。
- 版本元数据、规格文档相对链接及 `git diff --check`：通过。
- 远端构建与发布结果待完成；未执行本次浏览器和桌面实机验收。
