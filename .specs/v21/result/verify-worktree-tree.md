# Worktree 关系与同步验证记录

## 根入口、树层级与长按分流验证（2026-10-14）

本节仅记录本轮运行，不复用下方历史结果。对应[需求](../requirements/worktree-tree.md)与[规格](../features/worktree-tree/spec.md)。

| 验收项 | 本轮证据 |
| --- | --- |
| 根入口外露、子项不重复外露 | 真实 WorkspaceItem 浏览器预览中两个根项目显示入口；点击根入口打开 Worktree 管理，仅发起 overview GET，没有项目选择事件 |
| 桌面齿轮与键盘 | 未悬停齿轮宽度 0，悬停后 32px；Shift+F10 打开完整菜单；真实组件参数化测试覆盖桌面与移动的 ContextMenu、Shift+F10 |
| 层级连接与末项折线 | 根/子/孙/兄弟节点浏览器截图；workspace-tree-position 覆盖延续线、末项、缺失父项、环和深度上限 |
| 桌面/移动菜单与短按不冲突 | workspace-touch-menu 使用真实 Base UI ContextMenu/Popover 和 useTouchDrag，覆盖长按菜单、松手点击保护、短按选择与滚动取消 |
| 移动长按分流 | Chrome CDP 原生 touchStart/touchMove/touchEnd：静止 750ms 仅出现 contextmenu；等待 400ms 后移动仅出现 dragstart/drop/dragend，未出现菜单或 click |
| 不影响 Tab 与取消处理 | touch-drag 覆盖原 350ms 拖动、滚动、拖动后落点、短按、多指、touchcancel、卸载；navigation-drag 回归通过 |
| 窄屏 | iPhone 15 仿真和 320px 宽检查；各项目行 scrollWidth 等于 clientWidth，文档宽度等于视口；5 个齿轮占位宽度均为 0 |

运行命令：

```sh
pnpm exec vitest run tests/unit/lib/workspace-touch-menu.test.ts tests/unit/lib/workspace-tree-position.test.ts tests/unit/lib/touch-drag.test.ts tests/unit/lib/workspace-item-render.test.ts tests/unit/lib/workspace-menu-order.test.ts tests/unit/lib/mobile-workspace-expansion.test.ts tests/unit/lib/workspace-visibility.test.ts tests/unit/lib/workspace-group-order.test.ts tests/unit/lib/navigation-drag.test.ts
pnpm tsc --noEmit
pnpm exec eslint src/components/features/workspace/workspace-item.tsx src/components/features/workspace/workspace-tree-guides.tsx src/components/features/workspace/worktree-management-button.tsx src/components/features/mobile/mobile-workspace-actions.tsx src/components/features/mobile/mobile-navigation-sheet.tsx src/hooks/use-touch-drag.ts src/lib/workspace-order.ts tests/unit/lib/touch-drag.test.ts tests/unit/lib/workspace-touch-menu.test.ts tests/unit/lib/workspace-tree-position.test.ts tests/unit/lib/workspace-menu-order.test.ts tests/unit/lib/mobile-workspace-expansion.test.ts
pnpm build
git diff --check
```

61 项相关测试、完整 TypeScript、改动 TS/TSX ESLint、生产构建及 diff 检查通过。最终构建完成 Next.js 编译、24 个静态页面生成和 tsup 服务端打包。

预览脚本：`/tmp/workspace-tree-preview.cjs`，原生触摸事件脚本：`/tmp/workspace-tree-touch.cjs`。截图：`/tmp/workspace-tree-desktop-final.png`、`/tmp/workspace-tree-desktop-hover-final.png`、`/tmp/workspace-tree-mobile.png`、`/tmp/workspace-tree-mobile-menu.png`、`/tmp/workspace-tree-mobile-320.png`。这些是本机临时验证产物。

浏览器预览使用当前真实组件与生产 CSS，项目与 API 响应为本地模拟数据；模拟排序请求不改真实工作区。浏览器检查不代表完整应用端到端、真实 Git 写操作或 iOS/Android 实机验收。未执行这些验收。

## PR #37 主工作树发布（2026-10-14）

- 修复前，新增主工作树发布用例复现提交后与无改动发布按钮禁用、服务端 push/createDraft 被 main 提前阻断；修复后相关用例通过。
- `pnpm exec vitest run tests/unit/lib/worktree-delivery.test.ts tests/unit/lib/git-commit-delivery.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts tests/unit/lib/worktree-manager.test.ts tests/unit/lib/worktree-tools.test.ts tests/unit/lib/worktree-actions-api.test.ts`：105 项通过。覆盖主工作树 GitHub/GitLab 草稿、精确 HEAD 推送、显式确认、脏状态/操作中/锁定/缺失/未知/detached 阻断、分支或 HEAD 变化、未发布提交及目标分支校验；原有真实临时 Git 仓库的删除与 rebase/continue/abort 保护回归通过。
- `node --test tests/cli/features.test.cjs`：63 项通过，CLI 参数派发及主工作树发布帮助正常。
- 完整 `pnpm exec tsc --noEmit`、改动 TS/TSX 与 CLI 测试的 ESLint、`git diff --check` 通过。`bin/feature-commands.js` 被仓库 ESLint 默认忽略，强制检查发现已有 CommonJS require 与 no-require-imports 规则冲突；按该 CLI 的 CommonJS 格式运行 `pnpm exec eslint --no-ignore --rule '@typescript-eslint/no-require-imports: off' bin/feature-commands.js`，通过。
- `pnpm build` 通过（Next.js 编译、24 个静态页面生成、tsup 服务端打包）。本轮未执行浏览器/移动实机验收；发布测试模拟 Git 和托管 CLI，未向真实远端推送或创建 PR/MR。

## 关系树多仓库与错误保留审查修正（2026-10-14）

- 修复前运行新增用例，复现 4 项失败：多仓库父子双向合并入口缺失、主工作树冲突信息丢失、合并请求失败信息丢失；原双向合并与实际跨仓库阻断的 3 项测试通过。
- 修复后执行 `pnpm exec vitest run tests/unit/lib/worktree-merge-direction.test.ts tests/unit/lib/worktree-management-entry.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts`，13 项通过。新增测试还覆盖手动刷新失败时同时保留两类错误、刷新恢复后只清理加载错误、下次合并清除旧操作错误。
- 完整 `pnpm exec tsc --noEmit`、`pnpm exec eslint src/components/features/workspace/worktree-tree-dialog.tsx tests/unit/lib/worktree-merge-direction.test.ts`、`git diff --check` 通过。首次类型检查发现参数化测试可选参数声明不匹配，修正后类型检查、ESLint 和 13 项测试重新通过。
- `pnpm build` 通过（Next.js 编译、24 个静态页面生成、tsup 服务端打包）。本轮未运行浏览器/移动实机验收；组件测试使用模拟 API，未执行真实仓库合并。本轮不涉及 CLI 或服务端协议改动。

## 历史验证记录

2026-10-14：`pnpm exec tsc --noEmit` 通过；改动 TS/TSX 文件和测试文件的 `pnpm exec eslint` 通过；`pnpm exec vitest run tests/unit/lib/worktree-tools.test.ts tests/unit/lib/worktree-actions-api.test.ts tests/unit/lib/workspace-delivery-button.test.ts` 42 项通过；新增主工作树合并回归后 `pnpm exec vitest run tests/unit/lib/worktree-tools.test.ts` 32 项通过；`pnpm build` 通过；`git diff --check` 通过。未进行浏览器或移动实机验收。状态比较使用本地分支，不代表远端最新状态。

同日整合验证：`pnpm exec tsc --noEmit` 通过；改动 TSX 的 `pnpm exec eslint` 通过；相关 Worktree 管理、API 与同步单测合计 73 项通过。统一入口及嵌入视图的浏览器/实机交互尚未验收。

统一入口整合及忙碌状态防关闭后，重新执行 `pnpm exec tsc --noEmit`、改动 TSX 的 ESLint、`git diff --check` 和 `pnpm build`，均通过。浏览器/实机操作仍未执行。

同日单一交付入口验证：移除行内图标后，`pnpm exec tsc --noEmit`、改动文件 ESLint 和 `git diff --check` 通过；提交/交付、工作树同步与管理相关的 105 项回归单测通过；提交成功后呈现交付表单、推送需再次确认和无子节点仓库视图均有新增测试；`pnpm build` 通过。未进行浏览器或移动设备手动验收。

审查修正验证：新增长度为 2 的双向 UI 请求测试，分别核对确认文案、被修改的 item 目录和 targetRef/targetHead；真实 Git 仓库测试验证主工作树接受 merge、inspectSync 报告 main 且 rebase/continue/abort 均拒绝。`pnpm exec vitest run tests/unit/lib/worktree-merge-direction.test.ts tests/unit/lib/worktree-tools.test.ts` 35 项通过；`node --test tests/cli/features.test.cjs` 62 项通过，CLI merge 参数及离线帮助正常；完整 TypeScript、改动文件 ESLint 和 diff 检查通过。生产构建结果待记录。

审查修正后的 `pnpm build` 通过（Next.js 编译、静态页面生成、tsup 服务端打包）。仍未做浏览器/实机验收。

## 变更面板快捷入口验证（2026-10-14）

- `pnpm exec vitest run tests/unit/lib/git-commit-delivery.test.ts tests/unit/lib/git-commit-dialog.test.ts tests/unit/lib/worktree-delivery-dialog.test.ts`：11 项通过。覆盖提交后交付、显式推送确认、无改动直接交付、分支变化、overview 后 HEAD 变化、提交结果不明时禁止交付。
- 完整 `pnpm exec tsc --noEmit` 通过；本次改动的 DiffPanel、GitCommitDialog、GitCommitDelivery、git-commit 类型及交付测试文件 ESLint 通过。
- `pnpm build` 通过（Next.js 编译、24 个静态页面生成、tsup 服务端打包）；`git diff --check` 通过。
- 使用 agent-browser 在独立临时页面挂载真实 DiffPanel、提交弹窗、交付表单及当前主题 CSS，模拟 Git/API 响应。1040px 桌面下验证提交信息生成和提交结果；验证推送与草稿分别确认，确认前没有对应写请求，成功后显示草稿链接。Changes/History 均保留入口。
- 390px 和 320px 视口中工具栏正常换行，发布、刷新、关闭按钮均在视口内，文档无横向溢出；320px 发布弹窗内部滚动且无横向溢出。无改动页面打开弹窗显示已有提交发布提示，只发起 inspect/inspectSync，没有自动提交、推送或草稿请求。
- 浏览器控制台未报告错误。本次浏览器检查限定为真实组件配模拟接口，不代表真实 Git/远端发布、完整应用集成或移动设备实机验收；没有实际创建提交、推送或 PR/MR。
