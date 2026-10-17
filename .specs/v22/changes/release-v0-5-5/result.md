# v0.5.5 实施及验证记录

## 实施

- 发布前 main：`30f10003fe504f00ecefd2a15fd43369931cd4df`，与 GitHub 一致；工作区干净，本地及远端无 v0.5.5 标签。
- 先读取发布基线、v22 入口和 pmuxi 两项增量规格，再建立本需求规格。
- 复用既有发布工作流和构建，不增加脚本或产品功能，遵循 KISS/YAGNI。
- 执行 `npm version 0.5.5 --no-git-tag-version`；对比 HEAD 确认 package.json 仅版本变化，两个 bin、依赖及锁文件保持原样。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端工作流使用 Node 24，结果单独记录。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 首次 `pnpm test`：150 个文件通过、1 个失败；1256 项通过、1 项失败、1 项跳过。Git worktree 提交用例在 commitWorkingChanges 报 noChanges，CLI 阶段未运行；与上次发布观察到的失败相同。
- `pnpm exec vitest run tests/unit/lib/git-commit.test.ts`：22 项全部通过，未修改测试或实现；尚未确定首次失败根因。
- 最终 `pnpm test` 单独执行：退出码 0；151 个 Vitest 文件通过、1257 项通过、1 项跳过；两个 CLI 入口回归合计 133 项全部通过。
- 规格链接、版本元数据及 `git diff --check` 检查通过。
- 发布提交为 `1529a7f7fe9c1091baaab5d9f73aa3a4425e1229`；`git push --atomic origin HEAD:refs/heads/main refs/tags/v0.5.5:refs/tags/v0.5.5` 成功。`git ls-remote` 确认远端附注标签解引用后指向该提交。
- [Actions 38996611604](https://github.com/stirp/purplemux-improved/actions/runs/38996611604)：check、publish-npm、github-release 全部成功，Node v24.21.0 下冻结安装、ESLint、TypeScript、测试、版本校验及生产构建通过。
- npm OIDC/provenance 发布在 2026-10-17 02:56:19 UTC 返回 HTTP 202，提示正在处理；首次 registry 查询尚无 0.5.5，latest 仍为 0.5.4，随后公开可用性核验成功。
- [GitHub Release v0.5.5](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.5)：2026-10-17 02:56:35 UTC 发布，非草稿、非预发布；无 Electron 附件，符合现有发布规格。
- `curl https://registry.npmjs.org/purplemux-improved`：0.5.5 存在，latest 为 0.5.5，gitHead 与发布提交一致，registry 发布时间为 2026-10-17 03:00:29.933 UTC。
- 下载[官方 tarball](https://registry.npmjs.org/purplemux-improved/-/purplemux-improved-0.5.5.tgz)，Python hashlib 验证 SHA-512 与 registry integrity 一致；tarfile 确认版本、两个 bin、LICENSE、Skill、dist/server.js 及 .next/standalone 产物齐全。
- 使用 tarfile 的 data 安全过滤解包到临时目录；从 /tmp 执行包内 `node bin/cli.js skill` 与 `--help`。PMUX_PORT 指向无服务的端口 1、使用测试 token；命令退出码均为 0，Skill 标准输出与包内 SKILL.md 字节一致且无 stderr，帮助包含 pmuxi。
- 发布后以独立文档提交补录成功结果，v0.5.5 标签保持指向原发布提交。
- 本次不执行浏览器及完整安装实机验收。
