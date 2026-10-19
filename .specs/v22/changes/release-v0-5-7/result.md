# v0.5.7 实施与验证记录

## 实施

- 发布前 main 为 `98978e80b2b73eb79d6ac2487d82c07a51ee325f`，与 GitHub 一致；工作区干净，本地和远端不存在 v0.5.7 标签。
- 先读取发布基线、上一版规格及结果，建立本需求独立规格。
- 复用既有发布工作流和打包方式，遵循 KISS/YAGNI，不新增产品功能。
- 执行 `npm version 0.5.7 --no-git-tag-version`；对比 HEAD 确认 package.json 仅版本变化，依赖、两个 bin 和锁文件保持一致。
- 首次发布检查发现 PageShell 生命周期测试缺少新增 AppUpdateSettings 子组件 mock；先补充本需求规格，再按既有测试隔离方式补齐一行替身，不修改滚动锁断言或产品实现。修改前读取本地 Next.js Vitest 指南。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端使用 Node 24，结果单独记录。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 文档链接、版本元数据及 `git diff --check`：通过。
- 首次 `pnpm test`：1886 项通过、3 项失败、14 项跳过；Git worktree 提交用例报告 noChanges，PageShell 桌面/移动两项因 AppUpdateSettings 缺少 NextIntlClientProvider 失败；CLI 阶段未执行。
- Git 提交测试单独复测：22 项通过，未修改该测试或实现；首次失败根因未确定。
- 修正后 PageShell 与升级 API/guard/download/manager 相关测试：5 个文件、31 项通过。
- 修正后完整 `pnpm tsc --noEmit` 与改动测试文件 ESLint：通过。
- 最终 `pnpm test`：退出码 0；201 个 Vitest 文件通过、2 个跳过，1889 项通过、14 项跳过；CLI 153 项全部通过。日志含 jsdom 不支持完整导航的提示，不影响本次测试退出码及断言结果。
- 首次发布提交为 `e668349609dfc67312b152ddd857d077d43f6d65`，附注 Tag 对象为 `787017ffbe81c0e80031899bd7859af4730a10b4`；main 与 Tag 原子推送成功。
- [首次 Actions 39310438445](https://github.com/stirp/purplemux-improved/actions/runs/39310438445) 的 check 失败：测试断言通过，但 scheduled-task-service.test.ts 启动真实 pino 日志 worker，写入 mock homedir `/scheduled-test` 被 Runner 拒绝，产生 EACCES 及 3 次 worker exited 未处理异常。npm 与 GitHub Release 均跳过。
- 核验 GitHub Release v0.5.7 返回 404，官方 registry 无 0.5.7、latest 为 0.5.6；此次没有发布 npm 或 Release 产物。
- 先更新本次规格，补齐定时任务测试的 logger mock，隔离真实日志 worker，保持持久化失败/重试断言及产品代码不变。允许以精确旧 Tag 对象 lease 更新本次未发布标签，保留失败运行记录。
- 定时任务 service/runner 相关测试 30 项通过，完整 TypeScript 及改动测试文件 ESLint 通过。
- 日志隔离修正后的最终 `pnpm test` 再次退出 0：201 个文件通过、2 个跳过，1889 项通过、14 项跳过，CLI 153 项通过；无未处理日志线程异常。
- 修正后的最终发布提交为 `7d7f072df28faf2912dfa7311c4a186e0e7d6013`，Tag 对象为 `473eb3c0245d5042a8b3456df242ff80eee6cffe`。再次确认无 registry 版本和 Release 后，通过 `git push --atomic --force-with-lease=refs/tags/v0.5.7:787017ffbe81c0e80031899bd7859af4730a10b4 origin HEAD:refs/heads/main refs/tags/v0.5.7:refs/tags/v0.5.7` 更新失败标签及快进 main；远端 Tag 解引用核验一致。
- [第二次 Actions 39311735580](https://github.com/stirp/purplemux-improved/actions/runs/39311735580)：check、publish-npm、github-release 全部成功；Node v24.21.0 下冻结安装、ESLint、TypeScript、测试、Tag 版本校验和生产构建通过。
- npm OIDC/provenance 发布于 2026-10-19 19:36:16 UTC 返回 HTTP 202，提示正在处理；首次 registry 查询无 0.5.7、latest 为 0.5.6，约 7 分钟后公开可用性核验通过。
- [GitHub Release v0.5.7](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.7) 于 2026-10-19 19:36:33 UTC 公开，非草稿、非预发布，无 Electron 附件。
- 本次下载官方 Koffi 2.15.2 元数据及 tarball，SHA-512 与 registry 一致，包含 darwin_arm64/koffi.node 和 darwin_x64/koffi.node。
- `curl https://registry.npmjs.org/purplemux-improved`：0.5.7 存在、latest 为 0.5.7、gitHead 为最终发布提交，registry 发布时间为 2026-10-19 19:43:28.591 UTC。
- 下载[正式 tarball](https://registry.npmjs.org/purplemux-improved/-/purplemux-improved-0.5.7.tgz)，Python hashlib 校验 SHA-512 一致；tarfile 验证版本、两个 bin、Skill、LICENSE、server-supervisor.cjs、autostart.js、dist/server.js 和 standalone 产物均存在。
- tarfile data 安全过滤解包后，在 /tmp 使用端口 1 与测试 token 执行两个入口的 `skill` 和 `--help`，均退出 0；Skill 输出与随包文件逐字节一致、无 stderr，帮助包含 pmuxi。
- 临时目录中解包官方 Koffi 依赖并链接至主包 node_modules，Linux Node 通过正式包的 standalone Koffi shim 加载成功，导出 load 函数可用；未全局安装或重启用户实例。
- 最终规格链接、差异格式检查通过，发布成功结果以文档提交补录，Tag 保持指向最终发布提交。
- 本次不执行浏览器、完整安装或 macOS 实机验收。
