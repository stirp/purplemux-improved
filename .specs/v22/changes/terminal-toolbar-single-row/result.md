# 实施与验证

## 实施

- `src/components/features/workspace/terminal-commands-bar.tsx`：增加可选组合内容，将虚拟按键放在同一行右侧；两个列表可收缩并独立滚动，设置入口固定在两端。
- `src/components/features/workspace/pane-container.tsx`：普通终端使用组合布局，保留按键栏显示条件及 Agent 原有内联布局。
- `src/components/features/mobile/mobile-terminal-toolbar.tsx`、`mobile-surface-view.tsx`：输入框下合并命令及按键，断线仍展示禁用执行的命令栏。
- `tests/unit/lib/terminal-keys-ui.test.ts`：移动端组合组件增加命令 API mock，按键顺序断言改为检查按键组自身，避免依赖整页按钮索引。
- KISS / DRY / YAGNI：复用现有组件和发送回调，只增加组合插槽及布局约束；管理、排序、持久化与按键状态继续由原组件负责，无新增依赖或数据接口。

## 自动化验证

2026-10-19 执行：

- `pnpm exec tsc --noEmit`：完整类型检查通过。
- `pnpm exec eslint src/components/features/workspace/terminal-commands-bar.tsx src/components/features/workspace/pane-container.tsx src/components/features/mobile/mobile-terminal-toolbar.tsx src/components/features/mobile/mobile-surface-view.tsx tests/unit/lib/terminal-keys-ui.test.ts`：通过；最终移动端入口调整后重新检查该文件通过。
- `pnpm exec vitest run tests/unit/lib/terminal-commands-ui.test.ts tests/unit/lib/terminal-keys-ui.test.ts`：19 项通过，覆盖命令执行、断线禁用、不补发、排序、设置保存失败、功能键、移动端修饰键隐藏清除等既有行为。
- `git diff --check`：通过。

## 浏览器验证

使用实际 React 组件与项目 Tailwind CSS 编译临时组件页面，API 为内存测试数据，发送回调仅记录字节，不连接真实终端或修改实例配置。

| 验收 | 检查与结果 |
| --- | --- |
| 单行及窄屏 | 320、390、567、1280px，各检查普通双组、移动端、长命令列表、空命令及全部按键隐藏、整栏按键隐藏、断线，共 24 个场景通过 |
| 排列及溢出 | 两端设置入口均在视口内，所有按钮在同一行；页面 scrollWidth 等于视口宽度；溢出列表可以滚动至末尾 |
| 空状态和隐藏 | 两组配置均为空仍保留设置入口；按键栏隐藏或断线时命令组独占一行 |
| 高度 | 双组按钮行 45px，仅命令行 41px，节省原先独立按键行的高度 |
| 输入及发送 | 移动端填写并发送 `echo toolbar`，记录 `echo toolbar` 与 CR；点击 `git pull` 记录 `git pull` 加 CR |
| 设置入口 | 移动端两端设置按钮均可打开对应弹窗；按键弹窗打开后页面无横向溢出 |

证据：[桌面 567px](./desktop.png)、[移动端 390px](./mobile.png)、[布局测量数据](./layout-results.json)。

限制：浏览器验证为真实组件隔离页面，未启动完整应用、未连接真实 PTY、未执行完整生产构建，也未进行手机实机软键盘验收。桌面入口显示策略及 Agent 边界通过源码检查，相关输入行为由既有交互测试覆盖。

## 评审修复：连接切换保留编辑草稿

2026-10-19 修复移动端连接状态切换导致命令编辑实例卸载的问题。

- `mobile-surface-view.tsx` 始终挂载同一个 `MobileTerminalToolbar`，仅更新 `terminalConnected`；移除断线时切换为 `TerminalCommandsBar` 的分支及对应导入。复用内部已有显隐和禁用逻辑，不增加状态副本或草稿存储，符合 KISS / DRY。
- 新增 `tests/unit/lib/mobile-terminal-draft.test.ts`：挂载真实 `MobileSurfaceView` 及命令编辑组件，模拟终端连接状态；分别验证新增、编辑草稿经过 connected → disconnected → connecting → connected 后，弹窗实例、名称和多行命令保留；断线隐藏输入及按键、禁用执行，重连不自动保存或发送。
- 修复前运行该测试：2 项失败，均在断线后无法找到原弹窗；修复后运行该测试及原命令/按键交互测试：21 项通过。
- `pnpm exec tsc --noEmit`：通过。`pnpm exec eslint src/components/features/mobile/mobile-surface-view.tsx tests/unit/lib/mobile-terminal-draft.test.ts`：通过。`git diff --check`：通过。
- 浏览器复验（390px，真实 `MobileTerminalToolbar` 隔离页面，API 使用测试数据）：编辑名称“未保存名称”和命令 `echo unsaved` 后切换连接状态，断线及重连均保留弹窗和草稿；断线时输入与按键隐藏、命令 disabled 为 true，重连后输入恢复且 disabled 为 false；发送记录始终为空。
- 本次未重跑此前 24 个静态布局场景，未连接真实终端或进行手机实机验收。
