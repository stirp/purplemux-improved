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
- 远端冻结安装、构建、npm 与 GitHub Release 待标签推送后验证。
- 本次不进行浏览器和安装实机验收。
