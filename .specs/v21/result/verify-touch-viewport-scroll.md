# 触屏视口滚动约束验证记录

2026-10-13 本次实际执行：

| 检查 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm exec eslint src/components/layout/page-shell.tsx` | 通过 |
| `pnpm build` | 通过，Next.js 24 个静态页面生成完成，tsup 构建成功 |
| `pnpm exec eslint src/styles/globals.css` | CSS 文件无匹配规则，被忽略；未视为 CSS lint 通过 |
| `git diff --check` | 通过 |

验收映射：根层滚动限制由应用外壳存在与否限定，触屏固定 body 由触屏媒体查询限定；内部滚动容器没有改动。未执行桌面 Web 浏览器或 iPad/iPhone 实机验证，底部灰色区域、非对话拖动方向、内部滚动及键盘切换仍待人工确认。

## 2026-10-14 PR #35 Review 修复验证

| 检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/page-shell-viewport.test.ts` | 2 项通过，覆盖桌面与移动外壳挂载及卸载清理 |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm exec eslint src/components/layout/page-shell.tsx tests/unit/lib/page-shell-viewport.test.ts` | 通过 |
| `pnpm build` | 通过，Next.js 24 个静态页面生成完成，tsup 构建成功 |
| `git diff --check` | 通过 |

已移除 `:has()`，文档级 CSS 改用 `html.app-viewport-active` 作用域；Firefox 111 实际浏览器与 iPad/iPhone 实机尚未验收。

## 2026-10-15 问题选项聚焦导致灰色空白修复验证

本轮先依据新增验收条件修改规格，再增加消息滚动容器的 `relative`。复用主工作树已安装依赖进行检查，分屏库版本与锁文件一致，均为 `react-resizable-panels 4.10.0`。

| 检查 | 本轮实际结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过，完整项目类型检查 |
| `pnpm exec eslint src/components/features/timeline/timeline-view.tsx` | 通过 |
| `pnpm exec vitest run tests/unit/lib/page-shell-viewport.test.ts tests/unit/lib/async-question-answers.test.ts tests/unit/lib/timeline-display-hook.test.ts` | 16 项通过 |
| `git diff --check` | 通过 |
| Chrome 真实组件桌面与窄屏回归 | 通过，详情如下 |

### 浏览器方法与验收映射

使用 agent-browser 独立会话 `gray-border-fix`、Chrome 147 和本地预览 `http://127.0.0.1:8141`。临时脚本 `/tmp/purplemux-gray-analysis/real-preview.cjs` 通过 esbuild 打包本工作树的真实 `TimelineView`、`AskUserQuestionItem`、消息渲染与滚动依赖，用实际全局样式经 Tailwind/PostCSS 编译；Panel 使用真实分屏库。会话数据、输入框外壳、状态栏及 Next 路由使用测试夹具，网络提交被模拟，未向真实会话发送答案。

1. 桌面 1280×1000：长回复末尾显示问题卡片，点击选项、按 ArrowDown 切换选项、在消息区域向下滚轮 1500px；选中状态正确，外层滚动位置为 0，输入框顶部始终为 892px。
2. 将回复从 16 段增长至 40 段并再次点击：消息列表内容高度增长至 1830px，正常滚动至底部；外层高度与内容高度均为 936px，滚动位置为 0。
3. 负向对照：仅在测试页面移除消息滚动容器的 `relative`，外层内容高度变为 1624px；点击选项后外层滚动至 688px，输入框顶部从 892px 移至 204px，出现灰色区域。恢复该类后外层高度恢复为 936px，滚动位置归零。
4. 窄屏 390×844：重复选项点击、ArrowDown、滚轮，继续增长至 48 段并结束忙碌状态。消息内容高度为 3054px，内部可滚至 2390px；外层高度与内容高度均为 780px，滚动位置为 0，输入框顶部保持 736px。
5. 隐藏单选框的 `offsetParent` 为消息 `role="log"` 容器；浏览器错误列表为空。桌面与窄屏截图均人工检查，输入框和状态栏未被外层滚走。

临时截图位于 `/tmp/purplemux-gray-analysis/real/`：`fixed-desktop.png`、`control-without-relative.png`、`fixed-narrow.png`，仅作为本次运行辅助证据，不是仓库持久产物。

### 限制

本轮未执行生产构建、完整应用真实会话端到端、Firefox/Safari 或移动设备实机验收。CSS 定位缺陷由真实 Chrome 布局和聚焦验证，16 项单元测试不作为浏览器布局通过的替代证据。

## 2026-10-17 iPad iOS 15.6 侧栏滑动兼容验证

本轮复用主工作树已安装依赖（本工作树通过被 Git 忽略的 `node_modules` 符号链接引用），未修改依赖或锁文件。

| 检查 | 本轮实际结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/contained-touch-scroll.test.ts tests/unit/lib/visual-viewport.test.ts tests/unit/lib/page-shell-viewport.test.ts tests/unit/lib/touch-drag.test.ts tests/unit/lib/navigation-drag.test.ts tests/unit/lib/workspace-sidebar-search.test.ts tests/unit/lib/workspace-touch-menu.test.ts` | 91 项通过 |
| `pnpm exec tsc --noEmit` | 完整项目通过 |
| `pnpm exec eslint src/hooks/use-contained-touch-scroll.ts src/hooks/use-visual-viewport.ts src/components/layout/sidebar.tsx tests/unit/lib/contained-touch-scroll.test.ts tests/unit/lib/visual-viewport.test.ts` | 通过 |
| `git diff --check` | 通过 |
| Chromium 原生触摸隔离验证 | 通过，详情如下 |

### 浏览器方法与验收映射

使用 agent-browser 独立会话 `ipad-scroll-fix`，1024×768 视口，预览 `http://127.0.0.1:8157`。测试夹具导入本工作树真实 `useContainedTouchScroll` 与 `useVisualViewport`，以简化的固定外壳、Flex 侧栏、长列表和输入区复现滚动层次；不是完整 Sidebar 或业务页面。将 `CSS.supports('overscroll-behavior', ...)` 模拟为 false，启用兼容分支。通过 CDP `Input.dispatchTouchEvent` 发送浏览器原生触摸，记录的事件均为 `isTrusted=true`。

| 场景 | 观察结果 |
| --- | --- |
| 列表顶部向下滑 | scrollTop 保持 0，8 次 move 均取消默认行为 |
| 列表中部向下滑 | scrollTop 从 500 到 355，8 次 move 均放行 |
| 列表中部向上滑 | scrollTop 从 500 到 645，8 次 move 均放行 |
| 列表底部向上滑 | scrollTop 保持最大值 1994，8 次 move 均取消默认行为 |
| 侧栏固定头部向下滑 | 8 次 move 均取消默认行为 |
| 列表缩短为 3 行后双向滑动 | 两个方向均取消默认行为，scrollTop 保持 0 |
| 外壳与输入区几何 | 全部场景 shell top=0、bottom=768、window.scrollY=0、输入区 top=702 |
| 浏览器错误 | 错误列表为空 |

单元测试覆盖嵌套容器可消费方向、同一手势反转、固定头尾等非滚动区域、负/越界 scrollTop、横向和缩放放行、多指取消跟踪、touchend/touchcancel、能力检测及 React ref 卸载清理。已有排序、搜索、菜单测试作为相关行为回归；视口测试覆盖负偏移归零及键盘高度/正偏移/关闭序列。

临时辅助证据：`/tmp/purplemux-ipad-scroll-fix/check.cjs`、`result.json`、`preview.png`；不是仓库持久产物。

### 限制与待验收项

未执行 iPad iOS 15.6、对应旧 WebKit 或其他移动实机验收；Chromium 能力模拟不会复现 Safari 的系统回弹。未验证完整应用登录态、真实软键盘、安全区和移动抽屉端到端。本轮选择浏览器验证，未运行生产构建。最终仍需在用户设备上确认边界连续滑动、键盘开关和旋转后无整体上移；不得将本轮模拟视为实机通过。

### P1 Review 修正的本次复验

前一轮 91 项测试及单 hook 浏览器夹具未覆盖 React 捕获事件冲突，不能作为工作区行与排序同时启用的证据。本轮使用真实 `useContainedTouchScroll`、`useTouchDrag` 及 `createRoot` 组合夹具补足。

1. 修复前运行 `pnpm exec vitest run tests/unit/lib/contained-touch-scroll.test.ts`：22 项通过、2 项失败；失败为顶部下滑和底部上滑未取消默认行为，复现 P1。
2. 修复后再次运行上表同一组 7 个测试文件：99 项通过。新增集成覆盖上下边界、中部双向滚动、真实长按菜单及卸载；另覆盖侧栏外起点、React 截断结束/取消事件后的跟踪清理。
3. 重新运行 `pnpm exec tsc --noEmit`、上表同一组改动文件的 ESLint、`git diff --check`：全部通过。
4. Chromium 独立会话 `ipad-scroll-review`、1024×768，使用接入两个真实 hook 的 React 夹具，工作区行具有 `onTouchStartCapture`、`draggable`、`data-touch-context-menu`；CSS 支持检测仍模拟为 false。CDP 原生触摸验证结果：顶部/底部/短列表/固定头部越界手势取消，中部下滑 scrollTop 500→355、上滑 500→645；外壳 top=0、bottom=768，输入区 top=702，window.scrollY=0。
5. 在工作区行静止按住 700ms，记录菜单事件 `menu`，无拖动开始；按住 400ms 后移动并松手，记录 `start → drop → end`，确认排序事件链未被边界保护打断。浏览器错误列表为空。

本次临时脚本与结果位于 `/tmp/purplemux-ipad-scroll-fix/review-check.cjs`、`review-result.json`。浏览器仍为隔离 hook 集成夹具，未挂载完整 Sidebar 或提交真实排序接口；未执行生产构建、iOS 15.6 真机及软键盘验收。
