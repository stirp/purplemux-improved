# v0.5.9 实施与验证记录

## 实施

- 用户要求纳入新合并的阻断修复重新发布；核验 npm latest 已为 0.5.8，正式包 gitHead 为 a95049fc29b76451c3e38a83b8734713bff097ad。因此选择新补丁版本 0.5.9，不覆盖已发布版本。
- 产品基线为 fb430f94f951f0c672ea5b03d4d55885320880ae，与 origin/main 一致，包含 PR #80、#81 的 Codex 启动与状态修复。随后补录上一版结果形成文档提交 07aa621。
- 复用原发布流程、依赖与产物布局（KISS/DRY），不新增产品代码（YAGNI）。
- `npm version 0.5.9 --no-git-tag-version` 已执行；package.json 仅版本变更，锁文件未改动。

## 验证

- 本地 Node v22.14.0、pnpm 12.11.2；远端发布结果待完成。
- `pnpm lint`、`pnpm tsc --noEmit`：通过。
- 发布前远端无 v0.5.9 标签，GitHub Release 未找到，官方 registry 的 0.5.9 返回 HTTP 404。
- `pnpm exec vitest run --maxWorkers=1`：222 文件、2166 用例通过，2 文件、14 用例跳过，退出 0。日志包含 jsdom 未实现页面导航的提示，无失败断言。
- `pnpm test:cli`：153 项全部通过，退出 0。
- 版本元数据、锁文件无差异、文档相对链接与 `git diff --check`：通过。
- 本次未执行完整全局安装、浏览器或桌面实机验收。
