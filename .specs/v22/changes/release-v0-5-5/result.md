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
- 远端发布待执行。
- 本次不执行浏览器及完整安装实机验收。
