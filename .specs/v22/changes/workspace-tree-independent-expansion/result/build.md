# 实施记录

日期：2026-10-17。先编写[增量规格](../spec.md)，再修改实现。

## 变更入口

- `src/hooks/use-workspace-expansion.ts`：桌面与移动复用独立展开集合；初始化和外部切换追加目标路径，区分行内选择与外部选择，避免异步选中反馈重新打开刚收起的项目。搜索只影响展示，不覆盖原展开集合。
- `src/lib/workspace-order.ts`：分离路径收集与可见性计算；可见性检查整条祖先路径，防止已展开的孙节点越过收起的父节点显示。保留孤儿和循环节点的可访问性。
- `src/components/layout/sidebar.tsx`：接入展开状态；选择项目只追加揭示目标路径。
- `src/components/features/workspace/workspace-item.tsx`：非叶子箭头成为独立按钮，提供名称、aria-expanded 和原生键盘激活；阻断点击、双击、原生拖拽和触摸拖拽向行级操作传播。搜索期间禁用折叠按钮。
- `src/components/features/mobile/mobile-navigation-sheet.tsx`：沿用点项目行选择并切换展开，改为多个节点独立管理；抽屉关闭/重开不重置集合，空叶子不展示折叠箭头。
- 三个既有测试文件补充多根与兄弟展开、祖先收起恢复、搜索恢复、外部导航、同步、空叶子和按钮事件边界。

## 原则与边界

共享 Hook 管理交互状态，纯函数负责路径与可见性，避免桌面/移动各维护一套规则（DRY、单一职责）。采用 Set 与既有菜单、拖拽及搜索接口，不引入通用树组件、配置迁移或新依赖（KISS、YAGNI）。展开状态仅保留于组件生命周期；刷新按当前项目初始化。

## 审查修正

- 根因一：新建前捕获的 revealWorkspace 回调读取旧工作区列表，同时 selectedId 抑制了活动 ID 更新时的补展开。现在回调只向既有 sidebar-actions Store 提交目标 ID；共享 Hook 使用当前 props 中的最新列表解析路径，节点尚不存在时保留请求。
- 根因二：仅比较活动 ID 无法识别同 ID 的再次导航。`selectWorkspace` 每次选择都创建新的展开请求，由 Sessions、全局快捷键和桌面侧栏共用；不另建事件总线或修改两套导航调用者。
- 移动项目行传入 `{ reveal: false }`，继续由本地 toggle 管理选择并收起；移动新建/接管仍请求揭示。搜索期间消费请求但不改变原展开集合；保留目标标记，防止异步选择在清空搜索后重新展开。
- 删除桌面重复的局部揭示包装，复用公共选择入口（DRY）；请求与可见性解析分离，避免异步回调保存过时列表（单一职责、KISS）。
- 新增 `tests/unit/lib/workspace-expansion-navigation.test.ts`，真实挂载 React Hook 并使用 Zustand、Sessions 导航和全局快捷键处理器；仅替换网络、路由及按键绑定层。
