# 无同步目标时默认当前分支：验证记录

- 日期：2026-09-29
- 需求：[sync-target-current-branch](../requirements/sync-target-current-branch.md)

## 变更

- 复用服务端现有引用解析，在默认候选末尾加入当前本地分支，不新增接口或持久化字段（KISS、DRY）。
- 将同分支限制保留在同步执行层，使只读比较与执行校验各司其职（单一职责）。
- 弹窗对自身目标禁用 merge/rebase；草稿表单不将自身同步目标自动填入 PR/MR 目标。

## 自动化验证

`pnpm exec vitest run tests/unit/lib/worktree-tools.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts tests/unit/lib/worktree-delivery.test.ts tests/unit/lib/worktree-actions-api.test.ts tests/unit/lib/workspace-delivery-button.test.ts`

- 5 个测试文件、51 项测试全部通过。
- 真实临时 Git 仓库覆盖无元数据回退、保存目标与基线优先级、失效元数据、单分支无远程、detached HEAD、显式目标、同分支同步执行拒绝和现有 merge/rebase 行为。
- 组件逻辑测试覆盖默认勾选、操作禁用、切换后启用、刷新保留选择，以及草稿目标不默认自身。测试使用仓库已有的 Hook 模拟方式，不代表浏览器渲染验收。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm lint`：未通过。仅未修改的 `tests/cli/features.test.cjs` 第 1–8 行触发 8 处既有 `@typescript-eslint/no-require-imports` 错误；本次修改文件无 lint 报错。
- `git diff --check`：通过；本次新增文档的相对链接目标均存在。

## 验证边界

- 未执行生产构建或完整测试套件。
- 桌面和移动端共用弹窗逻辑已通过组件测试，未执行真实浏览器或实机验收。
- 未执行真实远程 fetch、push 或 PR/MR 创建。
