# v0.5.10 实施与验证记录

## 实施

- 发布前 main 为 `346fb052f79e9a619780eded6e3508b67ed9d5be`，与 origin/main 一致，工作区干净；npm latest 和 GitHub 最新 Release 均为 0.5.9，registry 无 0.5.10，远端无 v0.5.10 标签。
- 复用既有发布流程与包布局（KISS/DRY），不新增产品逻辑或依赖（YAGNI）。
- 执行 `npm version 0.5.10 --no-git-tag-version`；package.json 仅版本变化，锁文件无变化。

## 验证

- 本地 Node v24.14.1、pnpm 12.11.2；远端使用 Node v24.22.0。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 版本元数据、锁文件不变、规格相对链接及 `git diff --check`：通过。
- 首次全量 Vitest：231 文件、2296 用例通过；2 文件、2 用例失败；2 文件、14 用例跳过。失败分别为 queued-message-display 仍期望整个容器只有正文（新增时间戳导致不相等），idle-tab-close 仍期望关闭钩子拿到无 agentState 的旧布局（现已按 Agent 关联规格补齐身份）。CLI 阶段未执行。
- 先读取时间戳、Agent 身份及原消息投递/空闲关闭规格与本地 Next.js Vitest 指南，补充发布阻断修正约定，再调整测试，不更改产品行为。
- 首次针对性复测 4 项断言通过，但 idle-tab-close 的真实日志 worker 尝试创建模拟目录 /idle-close-test，触发 EACCES 未处理异常，整体退出 1。先补充隔离约定，再沿用 scheduled-task-service 等既有测试的 logger mock。
- 日志隔离修正后，queued-message-display 与 idle-tab-close 共 4 项测试通过，无未处理异常；改动测试文件 ESLint 与完整 TypeScript 检查通过。
- 最终 `pnpm exec vitest run --maxWorkers=1`：233 文件、2298 用例通过，2 文件、14 用例跳过，退出 0。包含 jsdom 未实现页面导航的提示，无失败断言或未处理异常。
- `pnpm test:cli`：153 项全部通过，退出 0。
- 本次未执行完整安装、浏览器或桌面实机验收。
- 测试修正提交为 `6a99abc`；发布提交为 `c2097a3240414b5e9794c1d8788fc4f5af6052cc`，附注 Tag 对象为 `4c57cc01a5eaec619aa46d70117b543386d166d7`。main 与 v0.5.10 原子推送成功，远端 Tag 解引用与发布提交一致。
- [Actions 39703810889](https://github.com/stirp/purplemux-improved/actions/runs/39703810889)：check、publish-npm、github-release 全部成功。远端 Node 24 冻结安装、ESLint、TypeScript、单元及 153 项 CLI 测试、Tag 版本校验和生产构建通过。
- [GitHub Release v0.5.10](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.10) 于 2026-10-22 01:11:44 UTC 公开，非草稿、非预发布。
- npm 于 2026-10-22 01:11:28 UTC 返回 HTTP 202；最初 registry 无 0.5.10、latest 为 0.5.9。正式 registry 发布时间为 2026-10-22 01:14:38.702 UTC；随后验证 latest 为 0.5.10、gitHead 与发布提交一致。
- 下载官方 [tarball](https://registry.npmjs.org/purplemux-improved/-/purplemux-improved-0.5.10.tgz)，SHA-512 与 registry integrity 一致；1279 个条目含版本元数据、LICENSE、两个 CLI、Skill、监督器、自启动入口、服务器和 standalone 产物，无 .env 文件。
- 安全解包到独立临时目录，两个入口的 --help 和 skill 共 4 项检查通过，Skill 输出与随包文件逐字节一致；使用测试端口与令牌，不访问或重启用户服务。
- 正式包保留 Node >=24、Koffi 2.15.2 和两个 bin；生产依赖未重新引入 electron-updater 或 lodash.isequal。未执行完整安装，不将元数据检查当作安装实机验收。
- 最终文档相对链接和差异格式检查通过；补录结果另行提交，发布标签保持指向发布提交。
