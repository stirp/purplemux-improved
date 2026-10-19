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
- 远端发布待完成。
- 本次不执行浏览器、完整安装或 macOS 实机验收。
