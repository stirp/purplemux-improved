# 验证记录

首次验证日期：2026-10-15。2026-10-16 审查修正的独立验证结果见末节。

## 自动化检查通过

- `pnpm exec vitest run tests/unit/lib/worktree-merge-direction.test.ts tests/unit/lib/worktree-management-entry.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts`：15 项通过。
- `pnpm exec tsc --noEmit`：完整类型检查通过。
- `pnpm exec eslint src/components/features/workspace/worktree-tree-dialog.tsx tests/unit/lib/worktree-merge-direction.test.ts`：通过。
- `pnpm build`：Next.js 16.2.6 编译、24 个静态页面生成、post-build 和 tsup 服务端打包全部通过。
- `git diff --check`：通过。需求目录 Markdown 链接及 depends_on 基线引用存在性检查通过。

## 验收映射

| 验收项 | 本轮证据 |
| --- | --- |
| 后部卡片双向就地确认、单处展示 | 新增两个方向的组件测试，三个关系含嵌套子节点；确认区必须是第三张卡片的子元素，且位于操作按钮之后；全局仅一个确认按钮 |
| 展开不执行合并、来源与目标正确 | 新增测试检查展开仅有 inspectSync；既有四组双向/多仓库用例核对确认文案、执行目录、targetRef 和 targetHead |
| 取消及重新展开 | 新增测试取消后无确认按钮、无 merge 请求、合并入口恢复，再在首张卡片就地展开 |
| 刷新及失败行为 | 新增测试刷新重建关系后确认仍属于第三张卡片；既有错误回归验证请求失败、主工作树冲突及刷新后提示保留 |
| 执行互斥与收起 | 源码复核：沿用 busy 禁用确认/取消以及合并入口；finally 清空确认并触发刷新，未修改原流程 |
| 移动端布局 | 源码复核：桌面与移动共用组件，确认文案 break-words，按钮 flex-wrap；生产构建通过 |

## 未执行及限制

没有执行浏览器可视化验收或 iOS/Android 实机验证。jsdom 测试验证 DOM 归属和操作行为，不证明实际视口中的滚动距离或触屏手感。未对真实仓库执行合并操作。

## 2026-10-16 审查修正验证

- 先增加删除、改挂父节点、删除后刷新失败三个隔离组件用例，执行 `pnpm exec vitest run tests/unit/lib/worktree-merge-direction.test.ts`：原 9 项通过、新增 3 项失败，确认复现。删除和改挂场景中其他合并按钮仍禁用；刷新失败场景仍展示失效确认。
- 修复后执行 `pnpm exec vitest run tests/unit/lib/worktree-merge-direction.test.ts tests/unit/lib/worktree-management-entry.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts`：18 项全部通过。
- 新增用例验证规格第 6 条：切换仓库视图期间模拟工作区数据删除/改挂，返回后确认清除、其余合并入口恢复；刷新失败也清除。另验证仅切换视图保留确认、关系恢复后旧确认不复活，以及可以打开另一卡片的确认，全程无 merge 请求。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec eslint src/components/features/workspace/worktree-tree-dialog.tsx tests/unit/lib/worktree-merge-direction.test.ts`：通过。
- `pnpm build`：Next.js 编译、24 个静态页面、post-build、tsup 均通过。
- `git diff --check` 及需求文档链接/基线引用检查：通过。
- 本轮未执行浏览器、手机实机或真实仓库删除；回归通过模拟工作区数据变化覆盖组件状态生命周期，不代表端到端删除流程已验收。
