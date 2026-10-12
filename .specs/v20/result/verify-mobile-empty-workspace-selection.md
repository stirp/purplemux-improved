# 移动端空工作区选择：验证记录

2026-10-12，本次运行结果。

## 环境

工作树没有 node_modules，临时链接本机 `/home/home/workspace/purplemux/node_modules`（Next.js 16.2.6）。默认 pnpm 校验依赖时尝试安装并因无 TTY 中止；后续直接调用已有工具，不修改依赖或 lockfile。

## 自动化与源码检查

| 检查 | 实际结果 |
| --- | --- |
| `pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=false exec vitest run tests/unit/lib/mobile-workspace-expansion.test.ts tests/unit/lib/session-workspace-navigation.test.ts` | 2 文件、28 项通过；直接运行 `node node_modules/vitest/vitest.mjs run` 相同文件也通过 |
| `node node_modules/typescript/bin/tsc --noEmit` | 完整类型检查通过；`pnpm exec tsc --noEmit` 也通过 |
| `node node_modules/eslint/bin/eslint.js src/components/features/mobile/mobile-navigation-sheet.tsx tests/unit/lib/mobile-workspace-expansion.test.ts` | 通过 |
| `git diff --check` | 通过 |
| `node node_modules/next/dist/bin/next build` | 类型阶段通过，Turbopack 因 node_modules 软链接指向项目 root 之外失败 |
| `node node_modules/next/dist/bin/next build --webpack` | 类型检查与编译通过；页面数据收集在 `/login` 因 `ReferenceError: self is not defined` 失败。相同错误已有历史记录，但本次结果仍为构建失败 |

## 验收映射与限制

- 工作区行选择：组件事件回归覆盖有 Tab、空 pane、未缓存布局；调用共享项目选择入口。
- 展开/收起及子项：已有回归全部通过；Tab 点击只走原有 surface 导航，不额外调用项目选择。
- 共享选择处理器：相关 Sessions 导航回归通过，包括移动端注册处理器调用；此项不代替浏览器路由验收。
- 空项目的新建入口及归属：源码检查 `mobile-terminal-page.tsx` 的空 pane 按钮与 `handleCreateTab`，以及 `use-layout.ts` 的 `createTabInPane`；已有请求使用所选 workspaceId、paneId 和工作区默认目录。本次未实际创建终端进程。
- 未运行真实浏览器、手机实机或真实 Agent 启动验收；布局失败回退沿用原实现，本次仅源码检查。

## PR #32 Review 验证（2026-10-13）

本轮使用现有 node_modules，所有 pnpm 命令均带 `--config.manage-package-manager-versions=false --config.verify-deps-before-run=false`，不修改依赖。

| 检查 | 本轮实际结果 |
| --- | --- |
| `pnpm … exec vitest run tests/unit/lib/mobile-workspace-expansion.test.ts tests/unit/lib/session-workspace-navigation.test.ts` | 2 文件 30 项通过 |
| `pnpm … exec tsc --noEmit` | 完整 TypeScript 检查通过 |
| `pnpm … exec eslint src/hooks/use-sidebar-actions.ts tests/unit/lib/session-workspace-navigation.test.ts` | 通过 |
| `git diff --check` | 通过 |
| `pnpm … exec next build --webpack` | 类型检查与编译通过；收集页面数据时 `/login` 报 `ReferenceError: self is not defined`，构建失败 |

- 新增回归使用真实 store：未注册桌面/移动端处理器时，工作区切换的同步订阅及导航回调均观察到旧布局已清空，paneCount 为 0 且不可 split；重复选择当前项目保留布局。
- 原有注册处理器、工作区行选择、展开/收起、Tab 与 Sessions 导航回归通过。
- 此轮未执行浏览器、手机实机或真实新建 Tab 验收；慢请求下的跨页面行为通过同步状态断言验证，不等同于浏览器端到端验收。
