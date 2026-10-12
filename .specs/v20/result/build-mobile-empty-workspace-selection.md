# 移动端空工作区选择：实施记录

2026-10-12，先补齐[需求](../requirements/mobile-empty-workspace-selection.md)和[移动导航规格](../features/mobile-navigation/spec.md)，再修改实现。

- 根因：工作区行只更新展开状态；选中项目依赖 Tab 点击，空项目无法触发切换。
- `src/components/features/mobile/mobile-navigation-sheet.tsx`：工作区行调用已有 `useSelectWorkspace`，复用移动端注册处理器、元数据和布局清理及返回首页逻辑；保留展开/收起和抽屉状态。
- 空 pane 的新建入口、工作区参数和默认 cwd 均复用现有实现，不添加接口或自动创建 Tab。以共享选择入口满足 KISS/DRY，避免重复状态逻辑。
- `tests/unit/lib/mobile-workspace-expansion.test.ts`：补充有 Tab、空 pane、未缓存布局的工作区行选择断言，并确认 Tab 点击仍走原导航。

检查结果见[验证记录](./verify-mobile-empty-workspace-selection.md)。

## PR #32 Review 修复（2026-10-13）

- 对应 [P2 review](https://github.com/stirp/purplemux-improved/pull/32#discussion_r4250835403)：从其他页面选择项目时移动终端页未挂载，兜底选择路径保留全局旧布局。
- 先更新需求、规格及跨页面流程，再在 `src/hooks/use-sidebar-actions.ts` 的无处理器分支复用 `useLayoutStore.clearLayout`，在元数据重置、项目切换和导航之前清理旧布局。保持当前项目重复选择及已注册处理器行为。
- 在已有 `session-workspace-navigation.test.ts` 补充切换通知/导航时布局为空与当前项目布局保留的回归；使用共享清理动作满足 KISS/DRY，不增加接口或状态机制。
