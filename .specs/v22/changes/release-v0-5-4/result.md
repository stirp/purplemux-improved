# v0.5.4 实施及验证记录

## 实施

- 发布前 main 为 `8e63d92467705cf6d2eb6d184192de96ec2cf421`，与 GitHub 一致，工作区干净，远端无 v0.5.4 标签。
- 已读取发布元数据基线及 v22 规格入口约定，先建立本需求规格。
- 复用现有发布工作流，不增加发布脚本或产品行为，遵循 KISS/YAGNI。
- 执行 `npm version 0.5.4 --no-git-tag-version`，仅改变包版本，依赖和锁文件未变。
- 全量检查暴露工作区菜单测试的 React mock 缺少紧凑侧栏新引入的 `useId`；先补充本次规格，再在既有 mock 增加稳定 ID，不修改产品逻辑或断言。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；GitHub Actions 使用项目要求的 Node 24，远端结果单独记录。
- `pnpm lint`：通过。
- `pnpm tsc --noEmit`：修改前与最终修改后均通过。
- `pnpm exec eslint tests/unit/lib/workspace-menu-order.test.ts`：通过。
- 首次 `pnpm test`：1124 项通过、4 项失败、1 项跳过；菜单 2 项因缺少 useId mock 失败，Git worktree 提交 1 项报告 noChanges，64 MiB 终端解析 1 项超过 5 秒限制。此次 CLI 测试未运行。
- Git 提交和终端测试单独重跑：2 个文件、30 项全部通过；未改动这两组测试或其产品实现。
- 菜单测试修复后重跑：11 项通过。
- 最终 `pnpm test`：退出码 0；Vitest 的 145 个文件通过，1128 项通过、1 项跳过；CLI 测试 63 项全部通过。
- 版本、包名、CLI 入口及文档相对链接检查通过；`git diff --check` 通过。
- 发布提交：`d3ee80039586883ffce4bdb4b41e74267f9c55b6`；通过 `git push --atomic origin HEAD:refs/heads/main refs/tags/v0.5.4:refs/tags/v0.5.4` 同时推送 main 和附注标签。
- `git ls-remote` 确认 GitHub 标签解引用后的提交与发布提交一致。
- [GitHub Actions 38834540461](https://github.com/stirp/purplemux-improved/actions/runs/38834540461)：check、publish-npm、github-release 全部成功；Node v24.21.0 下冻结安装、ESLint、TypeScript、测试、版本校验及生产构建通过。
- npm 使用 OIDC 与 provenance 发布，服务端于 2026-10-16 01:23:20 UTC 返回 HTTP 202，提示包正在处理中；首次 registry 查询仍返回版本不存在，随后独立核验成功。
- [GitHub Release v0.5.4](https://github.com/stirp/purplemux-improved/releases/tag/v0.5.4)：2026-10-16 01:23:38 UTC 公开发布，非草稿、非预发布；assets 为空，符合暂停 Electron 自动发布的约定。
- `curl https://registry.npmjs.org/purplemux-improved`：确认版本 0.5.4 存在，latest 为 0.5.4，gitHead 为发布提交，registry 发布时间为 2026-10-16 01:26:32.509 UTC。
- 下载[官方 npm tarball](https://registry.npmjs.org/purplemux-improved/-/purplemux-improved-0.5.4.tgz)，以 Python hashlib 对照 registry 的 SHA-512 integrity 校验通过；tarfile 只读检查确认 package.json 版本与唯一 CLI 入口、LICENSE、CLI 文件、dist/server.js 和 .next/standalone 产物存在。
- 远端成功结果在发布后以独立文档提交补录；v0.5.4 标签保持指向原发布提交。
- 本次不进行浏览器和安装实机验收。
