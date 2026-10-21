# v0.5.9 实施与验证记录

## 实施

- 用户要求纳入新合并的阻断修复重新发布；核验 npm latest 已为 0.5.8，正式包 gitHead 为 a95049fc29b76451c3e38a83b8734713bff097ad。因此选择新补丁版本 0.5.9，不覆盖已发布版本。
- 产品基线为 fb430f94f951f0c672ea5b03d4d55885320880ae，与 origin/main 一致，包含 PR #80、#81 的 Codex 启动与状态修复。随后补录上一版结果形成文档提交 07aa621。
- 复用原发布流程、依赖与产物布局（KISS/DRY），不新增产品代码（YAGNI）。
- `npm version 0.5.9 --no-git-tag-version` 已执行；package.json 仅版本变更，锁文件未改动。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端使用 Node v24.22.0。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 发布前远端无 v0.5.9 标签，GitHub Release 未找到，官方 registry 的 0.5.9 返回 HTTP 404。
- `pnpm exec vitest run --maxWorkers=1`：222 文件、2166 用例通过，2 文件、14 用例跳过，退出 0。日志包含 jsdom 未实现页面导航的提示，无失败断言。
- `pnpm test:cli`：153 项全部通过，退出 0。
- 版本元数据、锁文件无差异、文档相对链接与 `git diff --check`：通过。
- 本次未执行完整全局安装、浏览器或桌面实机验收。
- 发布提交为 `2019e7c2c350633649a60e928329076627ca6ec2`，附注标签对象为 `ff47e17d2089a7b264a6d625567edd894d3adcbe`；main 与 v0.5.9 原子推送成功。
- [Actions 39522492311](https://github.com/stirp/purplemux-improved/actions/runs/39522492311)：check、publish-npm、github-release 全部成功。Node 24 冻结安装、ESLint、TypeScript、单元及 153 项 CLI 测试、Tag 版本校验与生产构建通过。
- 远端标签解引用与发布提交一致；[GitHub Release v0.5.9](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.9) 于 2026-10-21 00:42:53 UTC 公开，非草稿、非预发布。
- npm 于 2026-10-21 00:42:38 UTC 返回 HTTP 202，随后 registry 暂无 0.5.9、latest 为 0.5.8。最终 registry 的 0.5.9 发布时间为 2026-10-21 00:46:49.134 UTC，latest 已为 0.5.9，gitHead 与发布提交一致。
- 下载官方 [tarball](https://registry.npmjs.org/purplemux-improved/-/purplemux-improved-0.5.9.tgz)，SHA-512 与 registry integrity 一致；1277 个条目包含版本元数据、LICENSE、两个 CLI、Skill、监督器、自启动入口、服务器及 standalone 产物，无 .env 文件。
- 安全解包到独立临时目录，两个入口的 --help 与 skill 共 4 项检查通过，Skill 与随包文件逐字节一致；使用测试端口和令牌，不访问或重启运行中的服务。
- 正式包保留 Node >=24、Koffi 2.15.2 和两个 bin；生产依赖不含 electron-updater 或 lodash.isequal。未执行完整依赖安装，不将包元数据检查表述为完整安装验收。
- 结果文档完成后执行 `git diff --check` 和相对链接检查，补录文档另行提交，已发布的标签保持不动。
