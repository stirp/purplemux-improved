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
- 修正后的远端发布待完成。
- 本次不执行浏览器、完整安装或 macOS 实机验收。
