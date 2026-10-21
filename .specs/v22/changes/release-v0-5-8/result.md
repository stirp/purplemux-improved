# v0.5.8 实施与验证记录

## 实施

- 发布前 main 为 199a7b30，与 origin/main 一致，工作区干净；npm latest 和 GitHub 最新 Release 均为 0.5.7，本地无 v0.5.8 标签。
- 沿用既有发布工作流，不新增产品逻辑或打包规则（KISS/YAGNI/DRY）。
- 已执行 `npm version 0.5.8 --no-git-tag-version`；package.json 仅版本变更，锁文件未改动。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端使用 Node v24.22.0。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 远端 v0.5.8 标签不存在，GitHub Release 返回未找到，registry 的 0.5.8 返回 HTTP 404。
- 首轮 `pnpm test` 与静态检查同时运行，终端 UI、会话状态 UI、64 MiB 终端解析用例超过默认超时。机器为 4 个逻辑 CPU、当时负载约 9；主动中断本次测试以降低并发，退出 130，不记为通过。
- 第二轮 `pnpm exec vitest run --maxWorkers=2`：220 文件、2130 用例通过；2 文件、14 用例跳过；terminal-keys-ui 首个用例超过 5000ms，导致后续 act 状态未收敛，合计该文件 10 项失败。
- 静态检查结束后 `pnpm exec vitest run tests/unit/lib/terminal-keys-ui.test.ts --maxWorkers=1`：10 项全部通过。未修改测试断言或超时阈值。
- 最终 `pnpm exec vitest run --maxWorkers=1`：221 文件、2140 用例通过，2 文件、14 用例跳过，退出 0。日志包含 jsdom 未实现页面导航的提示，无失败断言。
- `pnpm test:cli`：153 项全部通过，退出 0。
- 版本元数据、规格文档相对链接及 `git diff --check`：通过。
- 未执行本次浏览器和桌面实机验收。
- 发布提交为 `a95049fc29b76451c3e38a83b8734713bff097ad`，附注标签对象为 `2c382fd36e602dfee1151c90a1ba176d8d166929`；main 与 v0.5.8 原子推送成功，远端标签解引用与发布提交一致。
- [Actions 39484749255](https://github.com/stirp/purplemux-improved/actions/runs/39484749255)：check、publish-npm、github-release 均成功。Node 24 冻结安装、ESLint、TypeScript、单元测试、153 项 CLI 测试、Tag 版本校验和生产构建全部通过。
- [GitHub Release v0.5.8](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.8) 于 2026-10-20 19:39:28 UTC 公开，非草稿、非预发布。
- 发布任务成功后 registry 起初返回 404；官方 registry 记录的公开发布时间为 2026-10-20 19:53:28.317 UTC。后续核验 latest 为 0.5.8、gitHead 与发布提交一致。
- 下载官方 tarball，SHA-512 与 registry integrity 一致；1277 个归档条目包含 LICENSE、两个 CLI、Skill、监督器、自启动入口、dist/server.js 和 standalone/server.js，无 .env 文件。
- 在独立临时目录安全解包，两个入口的 --help 和 skill 共 4 项检查通过；Skill 输出与随包文件逐字节一致。正式包保留 Node >=24、Koffi 2.15.2，生产依赖不含 electron-updater 或 lodash.isequal。
- 上述公开可用性与包验证是在用户要求纳入新修复后补齐，v0.5.8 保持已发布内容，不覆盖标签；后续修复另发 v0.5.9。
