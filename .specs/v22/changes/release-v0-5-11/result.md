# v0.5.11 实施与验证记录

## 实施

- 发布前 main 为 `5b98f7deb37a34ec498f0cf301bb1e860c8f1671`，与 origin/main 一致，工作区干净；npm latest、GitHub 最新 Release 和包版本均为 0.5.10，registry 无 0.5.11、远端无 v0.5.11 标签。
- 复用现有发布流程和产物布局（KISS/DRY），不新增产品逻辑或依赖（YAGNI）。
- 执行 `npm version 0.5.11 --no-git-tag-version`，结构化比较确认 package.json 仅版本变化、pnpm-lock.yaml 未变。

## 验证

- 本地 Node v24.14.1、pnpm 12.11.2。
- `pnpm lint`、`pnpm tsc --noEmit`：退出码均为 0。
- `pnpm exec vitest run --maxWorkers=1`：238 个文件通过、2 个跳过；2403 项通过、14 项跳过，退出码 0，耗时 253.88 秒。jsdom Canvas 未实现提示未导致测试失败。
- `pnpm test:cli`：153 项通过、0 失败，退出码 0。
- `git diff --check`、版本元数据与本需求文档链接检查通过；提交前再次确认远端 main 未推进、v0.5.11 标签不存在。
- 日志保存在 `/tmp/purplemux-v0.5.11-{lint,types,unit,cli}.log`。

## 远端发布

- 发布提交：`7fa137a666c72aa967f7252d6cb1d562bcbe81c6`。
- 附注标签对象：`e9909f2680d36c4be81b405e847b421f82008647`；`git ls-remote` 确认 v0.5.11 解引用为发布提交，main 与标签已原子推送。
- [GitHub Actions 40733736350](https://github.com/stirp/purplemux-improved/actions/runs/40733736350)：check、publish-npm、github-release 均成功；包含冻结安装、静态检查、测试、标签版本校验、生产构建及 provenance 发布。
- 远端单元测试 238 文件通过、2 文件跳过，2395 项通过、15 项跳过；CLI 测试 153 项通过、0 失败；日志 `/tmp/purplemux-v0.5.11-ci-{check,publish}.log`。此处记录远端实际数量，不复用本地计数。
- npm 于 2026-10-28 17:19:20 UTC 返回 HTTP 202；registry 记录的正式公开时间为 2026-10-28 17:23:35.076 UTC（北京时间 2026-10-29 01:23:35）。
- [GitHub Release v0.5.11](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.11) 于 2026-10-28 17:19:48 UTC 公开，非草稿、非预发布。

## 正式包验证与限制

- 官方 registry 的版本与 latest 均为 0.5.11，gitHead 为发布提交；正式 tarball 下载成功，SHA-512 与 dist.integrity 一致。
- tarball 含 1281 个条目，package.json、LICENSE、两个 CLI 入口、server-supervisor、autostart、离线 Skill、dist/server.js、standalone/server.js 和 tmux.conf 均存在；未发现 `.env*` 文件。
- 版本、Node >=24、两个 bin、Koffi 2.15.2 验证通过，生产 dependencies 不含 electron-updater 或 lodash.isequal。
- 临时目录解包后以测试端口和 token 运行两个入口的 `--help` 与 `skill`，4 项检查均退出 0 且无 stderr，Skill 输出与随包文件逐字节一致；不连接正在运行的用户服务。
- 验证脚本 `/tmp/purplemux-v0.5.11-verify.py`，结果 `/tmp/purplemux-v0.5.11-verification.json`，正式包 `/tmp/purplemux-improved-0.5.11.tgz`。
- 文档链接、依赖规格路径和 `git diff --check` 验证通过；最终记录单独提交至 main，已发布标签保持不动。
- 未执行完整全局安装、浏览器或桌面实机验证；以上包与 CLI 验证不代表这些实机验收。
