# 应用实施记录

用户确认设计后，于 2026-10-16 实施。设计阶段的原型和结果仍保留于上级目录，不能将其视为应用验收证据。

## 变更入口

- `src/components/features/mobile/mobile-navigation-sheet.tsx`：自适应宽度、品牌与本地化页签、项目搜索、紧凑项目行、当前 Tab 摘要、触控尺寸及底部操作；使用现有 visualViewport Hook 适配软键盘可见区域。
- `src/components/features/mobile/mobile-workspace-actions.tsx`：常显更多按钮，使用现有 Sheet 实现底部面板；完整名称、所有目录、分支、端口及现有状态可读；原管理、创建、移组、改名和删除流程保持复用。菜单关闭恢复触发器焦点，进入后续弹窗时不抢焦点。
- `src/components/features/mobile/mobile-workspace-group-header.tsx`：独立语义按钮、44px 热区、计数右对齐，操作与折叠隔离。
- `src/styles/globals.css`：移动侧栏专属宽度、安全区、窄屏状态文字收纳及短视口滚动；保留不支持容器查询的窄屏回退。
- 三个已有测试文件同步新规格，并增加搜索过滤、IME Escape、恢复折叠、移动搜索长按和直接更多按钮的回归。

## 复用与边界

复用 `searchWorkspaces`、`WorkspaceStatusIndicator`、`useTouchDrag`、`useVisualViewport` 和全部既有业务弹窗。未新增依赖、持久化字段或后台接口，也未改造桌面侧栏。导航搜索中仅展示匹配项目及祖先，隐藏 Tab 列表，避免结果混入非项目匹配内容；清空恢复原导航。

KISS：只调整导航展示与操作入口。DRY：搜索、状态、触摸与业务行为复用已有实现。单一职责：导航负责过滤与选择，项目操作组件负责面板及原业务弹窗。未增加收藏、最近访问或其他新业务。

## 审查修正：详情复制菜单（2026-10-16）

`mobile-workspace-actions.tsx` 的 onContextMenu/onKeyDown 在处理前检查 currentTarget 是否包含事件目标，仅处理行内 DOM 事件。Portal 中的详情事件不再执行 preventDefault，保留原生复制和键盘菜单行为；无需在详情增加阻断冒泡或新的复制实现。使用最小范围条件修复，保持既有手势及菜单复用。

`workspace-touch-menu.test.ts` 增加目录/分支各自的 contextmenu、ContextMenu、Shift+F10 测试，实际挂载 Sheet Portal 并断言不取消默认行为。
