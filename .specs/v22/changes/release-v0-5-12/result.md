# v0.5.12 实施与验证记录

## 实施

- 发布前 main 为 `0db48c079d6c0778be22e43c8ff3924345583000`，与 origin/main 一致，工作区干净。
- v0.5.11 后合并 PR #91（新建 Tab 应用及会话选择器）和 #92（工作区／Tab 切换性能优化）；npm latest、GitHub 最新 Release 与本地包均为 0.5.11。
- 复用现有发布流程和产物布局（KISS/DRY），不新增产品逻辑或依赖（YAGNI）。
- 执行 `npm version 0.5.12 --no-git-tag-version`，结构化比较确认 package.json 仅版本变化、pnpm-lock.yaml 未变。

## 验证

- 本机 Node v24.14.1、pnpm 12.11.2。
- `pnpm lint`、`pnpm tsc --noEmit` 均退出 0；Browserslist 数据过期提示未导致检查失败。
- `pnpm exec vitest run --maxWorkers=1`：243 文件通过、2 文件跳过，2458 项通过、14 项跳过，退出 0，耗时 255.67 秒。
- `pnpm test:cli`：153 项通过、0 失败，退出 0。
- `git diff --check`、版本元数据、规格依赖及文档链接检查通过；提交前再次确认远端 main 未推进、v0.5.12 标签不存在。
- 本地日志 `/tmp/purplemux-v0.5.12-{lint,types,unit,cli}.log`。
- 远端构建、发布和正式包验证待完成；未执行完整全局安装、浏览器或桌面实机验证。
