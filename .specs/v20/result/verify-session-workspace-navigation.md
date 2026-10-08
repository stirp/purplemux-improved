# Sessions 导航同步侧边栏项目：验证记录

2026-10-07 初版检查记录（已被 2026-10-08 复审实现替代，初版测试隔离不足，不作为最终验收证据）。

## 自动检查

使用 `pnpm --config.verify-deps-before-run=false exec` 调用已有共享依赖，避免 pnpm 11 自动重建依赖目录。初次默认 pnpm 调用的测试和 lint 因非交互依赖重建失败，此后下列检查独立重跑。

| 检查 | 结果 |
| --- | --- |
| `vitest run tests/unit/lib/session-workspace-navigation.test.ts tests/unit/lib/workspace-visibility.test.ts tests/unit/lib/layout-tab-rename.test.ts` | 3 文件、24 项通过 |
| `tsc --noEmit` | 完整类型检查通过 |
| `eslint src/hooks/use-layout.ts tests/unit/lib/session-workspace-navigation.test.ts` | 通过 |
| `next build` | 类型检查通过；Turbopack 因 node_modules 符号链接指向工程根目录之外失败 |
| `next build --webpack` | 类型检查及编译通过；收集 `/login` 页面数据时因 `ReferenceError: self is not defined` 失败，完整构建未通过 |
| `git diff --check` | 通过 |

## 验收映射与限制

- 需求 1：跨项目、同项目、其他路由入口的工作区选择及 Tab 焦点/待聚焦状态测试通过。
- 需求 2：父项目分组继承、分组展开和子项目激活路径可见性测试通过。
- 需求 3：Claude/Codex 已有会话复用、当前工作区新建恢复 Tab、重建工作区使用新 ID 测试通过。
- 需求 4：缺少路径、布局查询失败和 Tab 创建失败保留侧边栏状态测试通过。
- 需求 5：测试、类型、lint 已通过；构建结果见上表。

未执行真实浏览器点击、高亮视觉与自动滚动检查，未执行移动端实机验收。桌面和移动端共用导航函数及现有激活工作区状态，抽屉关闭和父子展开接线经源码检查；此项不等于运行验收通过。

## 2026-10-08 复审验证

本次重新运行，未借用上方初版结果。命令均使用 `pnpm --config.verify-deps-before-run=false exec`。

- `vitest run tests/unit/lib/session-workspace-navigation.test.ts tests/unit/lib/workspace-visibility.test.ts tests/unit/lib/layout-tab-rename.test.ts`：3 文件、34 项通过，无未处理错误。
- 完整 `tsc --noEmit`：通过。
- ESLint：覆盖 use-layout、use-session-navigation、use-sidebar-actions、sidebar、notification-sheet 和新测试，通过；最后补强当前项目 Tab 焦点断言后，测试文件单独复检。
- `next build --webpack`：本次类型检查及编译通过；收集 `/login` 页面数据再次因 `ReferenceError: self is not defined` 失败，完整构建未通过。
- `git diff --check`：通过。

验收覆盖 Sessions 专用入口、其他路由、两类代理复用/新建、真实新 Tab 布局刷新、重建项目实际分组、桌面/移动端注册选择处理器调用、临时展开取消、失效 Tab/恢复失败/hydrate 失败不定位，以及通用导航保持原侧边栏状态。测试恢复所有相关 store 的完整快照，不在活 store 上 spyOn；通过 setWorkspaceId 清除跨用例 fetch 抑制状态。

分组保存偏好始终不变且无分组 PATCH，避免 reveal 引入双份全量配置写入及同步回声。Projects 标签仍沿用已有 localStorage，激活工作区仍沿用已有保存动作；不能描述为整个导航不持久化。

未运行浏览器/移动端实机验收；自动化 handler 调用证明选择路径复用，不替代真实上一项目回退操作与视觉验收。认证跳转和登录后恢复深链属于原通用导航能力，本次恢复其原行为，未新增跨登录保存导航意图能力。
