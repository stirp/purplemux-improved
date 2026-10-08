# Sessions 导航同步侧边栏项目：验证记录

2026-10-07，本次实际运行。

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
