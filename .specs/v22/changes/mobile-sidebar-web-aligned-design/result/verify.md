# 应用验证记录

日期：2026-10-16。以下为用户确认后应用实施的本次运行结果。

## 自动化

以下 9 个文件、97 项测试通过：

```bash
pnpm exec vitest run \
  tests/unit/lib/mobile-workspace-expansion.test.ts \
  tests/unit/lib/workspace-menu-order.test.ts \
  tests/unit/lib/workspace-touch-menu.test.ts \
  tests/unit/lib/workspace-search.test.ts \
  tests/unit/lib/workspace-compact-status.test.ts \
  tests/unit/lib/navigation-drag.test.ts \
  tests/unit/lib/touch-drag.test.ts \
  tests/unit/lib/workspace-visibility.test.ts \
  tests/unit/lib/workspace-tree-position.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/components/features/mobile/mobile-navigation-sheet.tsx src/components/features/mobile/mobile-workspace-actions.tsx src/components/features/mobile/mobile-workspace-group-header.tsx tests/unit/lib/mobile-workspace-expansion.test.ts tests/unit/lib/workspace-menu-order.test.ts tests/unit/lib/workspace-touch-menu.test.ts
 git diff --check
```

完整 TypeScript、全部改动 TS/TSX 的 ESLint、差异格式检查均通过。
首轮测试使用旧的 Popover/常驻路径断言，出现 12 项失败；按已确认规格更新为底部 Sheet 与完整元数据面板后通过，继续保留业务及手势断言。

## 实际组件浏览器验证

独立会话 `agent-browser --session mobile-sidebar-impl` 访问 localhost:8147。使用 esbuild 编译当前真实 React 组件，PostCSS 编译仓库 Tailwind；仅路由、网络与示例工作区数据隔离，不改写用户配置。不是静态设计 HTML，也不是完整 Next.js 应用端到端运行。

| 验收 | 本次证据 |
| --- | --- |
| MS-01 宽度 | 320px 视口抽屉为 296px；390px 为 366px；430px 为 400px。检查无抽屉或项目行横向溢出 |
| MS-01 短屏 | 844×390 横屏时 short-viewport=true，列表高度 452px，抽屉 overflow-y=auto、scrollHeight=725，可整体滚动 |
| MS-02 点击与字号 | 320px 视口项目行 50px，更多按钮 44×44px；根字号放大到 24px 后行高 74px，抽屉 clientWidth/scrollWidth 均为 399px |
| MS-02 主题 | 实际浅色、深色组件截图已保存，紫色选中、树线与状态保持可辨识 |
| MS-03 搜索 | 输入 feat/mobile-sidebar，只有 root/mobile 两个项目，均 draggable=false；不存在词显示无结果；Escape 恢复 5 个项目且导航仍打开 |
| MS-03 IME/偏好 | 自动化覆盖组合输入 Escape 保留查询并阻止关闭导航，以及清空搜索恢复显式收起状态 |
| MS-04 导航与触摸 | 自动化覆盖空项目、Tab 导航、祖先展开、静止长按、释放点击保护、首次菜单操作、搜索禁拖与滚动；可见更多按钮不会选择项目 |
| MS-05 完整信息 | 实际底部面板展示完整项目名、两个目录、分支与状态；子项目移组为禁用，创建/管理/改名/删除均保留 |
| MS-06 状态 | 原状态聚合及紧凑状态回归通过；实际截图中审批中保留原文案，详情使用原完整状态组件 |
| MS-07 弹层 | 更多进入重命名，取消后仅导航弹层保留，焦点恢复到原项目的 SheetTrigger；Escape 可关闭更多面板 |

截图：[浅色](./mobile-light.png)、[深色](./mobile-dark.png)、[操作面板](./mobile-actions.png)。截图使用上述隔离数据；最后分组计数修正仅影响折叠后的计数，不改变截图中的展开状态。

## 限制

- 未运行完整 Next.js 生产构建，本次按变更影响选择实际组件浏览器验证。
- 未接入真实 Agent、tmux、WebSocket、持久化 API；未验证生产数据操作或真实断线重连。
- 软键盘使用既有 visualViewport 逻辑并验证短视口回退，未进行 iOS/Android 键盘、安全区、系统输入法或读屏实机验收；合成事件和浏览器视口不能替代实机。
- 没有 Git 提交、推送、发布或重启用户运行实例。

## 审查修正后重新验证：详情复制菜单（2026-10-16）

- 修复前：新增目录/分支 × contextmenu/ContextMenu/Shift+F10 共 6 项全部失败，defaultPrevented 为 true，复现审查意见。
- 修复后：运行 `pnpm exec vitest run tests/unit/lib/workspace-touch-menu.test.ts tests/unit/lib/workspace-menu-order.test.ts tests/unit/lib/mobile-workspace-expansion.test.ts`，3 个文件、59 项通过，保留项目菜单、触摸、改名和导航回归。
- 完整 `pnpm exec tsc --noEmit` 通过。
- `pnpm exec eslint src/components/features/mobile/mobile-workspace-actions.tsx tests/unit/lib/workspace-touch-menu.test.ts` 通过。首次检查发现新增测试 createElement 内联 children 的 lint 问题，按现有 Harness 的 props 组织方式修正后通过。
- `git diff --check` 通过。
- 浏览器独立会话 `mobile-sidebar-copy` 使用上述实际组件隔离环境。选中两个目录及一个分支，分别派发三种菜单事件，9 个结果均为 defaultPrevented=false、dispatchEvent=true，选区保留；工作区行 contextmenu 仍被自定义菜单接管且面板打开。浏览器运行错误为空。
- 浏览器验证使用真实 DOM/Portal 和合成事件，未验证操作系统原生菜单呈现或剪贴板实际写入，未进行手机实机验收。未重新执行生产构建；本次以实际组件浏览器复核验证事件边界。

## 合并冲突解决后验证（2026-10-16）

- `pnpm exec vitest run tests/unit/lib/workspace-touch-menu.test.ts tests/unit/lib/workspace-menu-order.test.ts tests/unit/lib/mobile-workspace-expansion.test.ts tests/unit/lib/delete-workspace-dialog.test.ts`：4 个文件、82 项通过。
- 完整 `pnpm exec tsc --noEmit`：通过。
- `pnpm exec eslint src/components/features/mobile/mobile-workspace-actions.tsx tests/unit/lib/workspace-menu-order.test.ts`：通过。
- 冲突标记扫描及 `git diff --check`、`git diff --cached --check`：通过；解决后 `git ls-files -u` 无条目。
- 本次仅整合已有两项实现，未重新执行浏览器或生产构建；不能将前述历史浏览器记录视为本次运行。
- 已暂存冲突解决及对应测试、规格记录，未创建合并提交或推送。
