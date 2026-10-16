# 验证记录

日期：2026-10-16。初次实施的检查记录见下方；审查修正后的重新验证见文末，不以初次通过结果代替回归验证。

## 自动化

以下 13 个测试文件共 120 项通过：

```bash
pnpm exec vitest run \
  tests/unit/lib/workspace-search.test.ts \
  tests/unit/lib/workspace-item-render.test.ts \
  tests/unit/lib/workspace-tree-position.test.ts \
  tests/unit/lib/workspace-visibility.test.ts \
  tests/unit/lib/workspace-touch-menu.test.ts \
  tests/unit/lib/workspace-reorder.test.ts \
  tests/unit/lib/session-workflow.test.ts \
  tests/unit/lib/session-workflow-ui.test.ts \
  tests/unit/lib/region-typography.test.ts \
  tests/unit/lib/region-typography-interaction.test.ts \
  tests/unit/lib/workspace-compact-status.test.ts \
  tests/unit/lib/worktree-management-entry.test.ts \
  tests/unit/lib/touch-drag.test.ts
```

- 完整 `pnpm tsc --noEmit`：通过。首次运行发现新增测试数据的 worktree 字段错误，修正为现有 `repository` 字段后通过。
- 对全部改动 TS/TSX 与测试文件运行 `pnpm exec eslint`：通过。
- `pnpm build`：最终版本通过，包括完整 TypeScript、Next.js 页面编译/静态页面生成、standalone 资源处理和 tsup 自定义服务器构建。
- `git diff --check`：通过。

## 验收映射

| 编号 | 证据与结果 |
| --- | --- |
| CS-01 | 工作区渲染测试确认元数据留在 title/aria-label 中、没有常驻目录行及未开始文字；浏览器默认节点高约 36px |
| CS-02 | 最终构建通过 Chromium 浅色/深色目视检查；设置 API 切换主题后重新加载，确认实际 dark 类及样式生效 |
| CS-03 | 搜索单元测试覆盖名称/路径/分支、全祖先链、孤儿、循环及清空；浏览器搜索 `optimize-tree` 仅显示父与子，无匹配时显示提示 |
| CS-04 | 浏览器先折叠生产力，再搜索子分支，临时展开；Escape 后恢复折叠；搜索时所有结果不可拖拽，清空后恢复 |
| CS-05 | 状态渲染测试覆盖 pending 隐藏、移动原样式、等待输入优先、并行执行提示、断连未知、review 独立语义、人工完成图标；工作阶段原测试通过 |
| CS-06 | 浏览器聚焦根行显示管理按钮，打开工作树管理时激活项仍为子工作区；双击 MyVibeHarness 改名并保存成功，再恢复原名；Shift+F10 打开完整项目菜单；原触摸/拖拽/管理测试通过 |
| CS-07 | 最终 160px 侧栏的全部节点 clientWidth/scrollWidth 均为 141px，名称保留 57–89px，底部新建按钮保持 40px 高；40px 字号时节点内容高 72px、顶部 76px、标签栏 72px，状态文字收起，名称保留 177–243px，无纵向裁切 |
| CS-08 | 120 项测试、完整类型检查、ESLint 和最终构建通过；最终页面浏览器 errors 输出为空 |

## 浏览器截图

使用 `agent-browser --session compact-sidebar` 检查构建后的独立 Next.js 实例；窗口 1440×1000，标准侧栏宽 320px。截图裁剪只移除右侧空工作区，不重绘组件。

- [浅深色对照](./sidebar-comparison.png)
- [浅色](./sidebar-light.png)、[深色](./sidebar-dark.png)
- [160px 窄侧栏](./sidebar-narrow.png)、[40px 区域字体](./sidebar-large-font.png)

浏览器验证前后没有修改用户实际工作区配置；独立浏览器会话及验证服务器在完成后关闭。

## 限制

- 浏览器验证使用构建后的 Next.js 页面及隔离配置，未接入真实 Agent/tmux/WebSocket 服务；不声称通过真实 Agent 运行、断线重连或终端会话验收。
- 移动交互使用已有 jsdom 回归测试，未进行 iOS/Android 实机验收。
- Electron 原生窗口未进行实机验收；桌面浏览器验证不能替代该项。

## 审查修正后重新验证（2026-10-16）

- 修复前将 `workspace-touch-menu.test.ts` 扩展为桌面、桌面搜索、移动三种场景：搜索场景的静止长按和两种首次菜单操作共 3 项失败，复现审查问题。
- 修复后重新执行本文开头的 13 个测试文件：**131 项全部通过**。新增覆盖搜索模式菜单、释放点击保护、首次重命名、短按选择、100ms/400ms 后移动允许滚动，以及禁用拖拽时无拖拽事件。
- 完整 `pnpm tsc --noEmit`：通过。
- `pnpm exec eslint src/hooks/use-touch-drag.ts src/components/layout/sidebar.tsx tests/unit/lib/workspace-touch-menu.test.ts tests/unit/lib/touch-drag.test.ts`：通过。
- `pnpm build`：通过，包括 Next.js 类型检查、生产页面编译、standalone 资源处理和 tsup 构建。
- `git diff --check`：通过。

使用 `agent-browser --session compact-sidebar-fix` 访问本轮构建的隔离 Next.js 实例 `http://127.0.0.1:8033`，继续使用临时测试数据：

| 验收 | 本轮观察 |
| --- | --- |
| CS-07：160px 侧栏状态可读 | 悬停行、直接悬停状态图标、键盘聚焦（鼠标移出）、Shift+F10 打开菜单四种场景中，状态均为 `display:flex`、宽 12px；文字收起，title/aria-label 均保留“审批中 / 工作状态: 审批中” |
| CS-07：空间与溢出 | 子工作区名称在设置按钮显示时仍有 25px；行 clientWidth/scrollWidth 均为 141px，无横向溢出；完成状态图标及提示也保持可见 |
| CS-04 / CS-06：搜索长按 | 输入 `optimize-tree` 后，在实际搜索结果 DOM 派发合成触摸事件：`draggable=false`；400ms 后移动不阻止滚动、不打开菜单；静止 700ms 打开菜单，释放事件被阻止；全过程 dragstart 次数为 0 |
| CS-04：清空恢复 | 点击清空搜索后，所有工作区行恢复 `draggable=true` |

截图：[窄侧栏状态悬停与聚焦](./sidebar-narrow-status-fix.png)。截图只裁去右侧空工作区，不重绘组件。浏览器 errors 输出为空。

本轮触摸验证为 jsdom 及浏览器合成事件，未替代手机实机验收；仍未接入真实 Agent/WebSocket 或 Electron 原生窗口。独立浏览器会话和临时服务器已关闭，未重启用户实例。
