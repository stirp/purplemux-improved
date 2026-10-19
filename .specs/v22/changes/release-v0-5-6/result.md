# v0.5.6 实施与验证记录

## 实施

- 发布前 main 为 `3604081204ed908ab599cca4d51437cc89e4eb19`，与 GitHub 一致，工作区干净；本地及远端不存在 v0.5.6 标签。
- 先读取发布规范、上一版发布规格、网页文件访问的原生依赖约定，再建立本需求规格。
- 复用现有工作流，不新增发布机制或产品行为，遵循 KISS/YAGNI。
- 执行 `npm version 0.5.6 --no-git-tag-version`；与 HEAD 比较确认 package.json 仅版本变化，两个 bin、依赖及锁文件不变。
- 发布后等待 registry 时复核 post-build 的现有说明：Web 安装通过主包声明的依赖提供 Koffi，standalone 的 hashed external shim 向上解析；Electron 才依赖完整 standalone/node_modules。修正本次验收约定以检查实际安装依赖布局，而非要求 Web tarball 重复捆绑 node_modules；未改动产品或打包实现。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端使用 Node 24，单独记录结果。
- `pnpm lint`、`pnpm tsc --noEmit`：均通过。
- 规格相对链接、版本元数据检查及 `git diff --check`：通过。
- `pnpm test`：退出码 0；175 个 Vitest 文件通过、2 个跳过，1542 项通过、14 项跳过；CLI 测试 133 项全部通过。本次测试未与 lint/类型检查并行执行，首次全量运行通过。
- 发布提交 `a35a48e936e8e458effd2412fd33d5d79093ba2e`；`git push --atomic origin HEAD:refs/heads/main refs/tags/v0.5.6:refs/tags/v0.5.6` 成功，远端附注标签解引用与该提交一致。
- [Actions 39148803182](https://github.com/stirp/purplemux-improved/actions/runs/39148803182)：check、publish-npm、github-release 均成功；Node v24.21.0 下冻结安装、ESLint、TypeScript、测试、Tag 版本校验与生产构建通过。
- npm OIDC/provenance 发布于 2026-10-18 17:20:26 UTC 返回 HTTP 202，提示包正在处理；等待期间版本接口及 tarball 返回 404，latest 仍为 0.5.5。约 14 分钟后公开可用性核验通过。
- [GitHub Release v0.5.6](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.6) 于 2026-10-18 17:20:41 UTC 公开，非草稿、非预发布；无 Electron 附件。
- `curl https://registry.npmjs.org/purplemux-improved`：0.5.6 存在，latest 为 0.5.6，gitHead 与发布提交一致，registry 发布时间为 2026-10-18 17:34:45.386 UTC。
- 下载[官方 tarball](https://registry.npmjs.org/purplemux-improved/-/purplemux-improved-0.5.6.tgz)，Python hashlib 对比 registry SHA-512 通过；tarfile 确认版本、两个 bin、LICENSE、Skill、dist/server.js 及 standalone 产物齐全，依赖声明包含 Koffi 2.15.2。
- 通过 tarfile data 安全过滤解包，从 /tmp 执行包内 `node bin/cli.js skill` 和 `--help`；使用端口 1 和测试 token，均退出 0，Skill 输出与包内文件逐字节一致且无 stderr，帮助包含 pmuxi。
- 下载官方 `koffi@2.15.2` 元数据和 tarball，SHA-512 校验通过，归档含 darwin_arm64/koffi.node 与 darwin_x64/koffi.node。将此依赖解包到临时目录并链接至主包 node_modules，Linux Node 加载实际发布包中的 standalone Koffi shim 成功，导出 load 函数可用；未执行全局安装。
- 最终文档相对链接及 `git diff --check` 通过；成功结果以独立文档提交补录，保持 v0.5.6 标签指向原发布提交。
- 本次不执行浏览器、完整安装或 macOS 实机验收。
