# 触屏视口滚动约束实施记录

2026-10-13 先依据[需求](../requirements/touch-viewport-scroll.md)补齐视口约定，随后修改 `src/styles/globals.css` 与 `src/components/layout/page-shell.tsx`。2026-10-14 将增量规格和记录归档至[v21 工作区视口规格](../features/workspace-viewport/spec.md)，保留[v20 历史规格](../../v20/features/terminal-rendering/spec.md)。

`page-shell.tsx` 为应用外壳添加 `app-viewport` 标识，`globals.css` 只在外壳存在时关闭 html/body 的溢出与越界滚动，避免桌面 Web 底部露出文档外背景。触屏环境进一步固定文档 body，防止拖动外壳。应用外壳继续依据 visual viewport 定位；侧栏、对话和弹层的内部滚动容器不改变。

验证结果见[验证记录](./verify-touch-viewport-scroll.md)。

2026-10-14 PR #35 Review 修复：Firefox 111 不支持 `:has()`，由 `PageShell` 挂载时给 `html` 添加 `app-viewport-active`，卸载时移除；CSS 改为普通类选择器。新增页面外壳生命周期测试覆盖桌面与移动分支。

## 2026-10-15 问题选项聚焦导致灰色空白

先更新需求、工作区视口规格、PRD 索引与任务表，再修改 `src/components/features/timeline/timeline-view.tsx`：为 `role="log"` 的实际消息滚动容器增加 `relative`。

问题卡片中的 `sr-only` 单选框及 legend 使用绝对定位。原先其定位祖先在消息滚动容器外，导致隐藏控件的溢出计入外层 Panel；点击选项聚焦控件时 Chrome 滚动外层 Panel，随后滚轮可继续滚出底层终端背景。新增定位边界后，隐藏控件留在消息滚动区域内。

采用一个 Tailwind 类完成修正，复用现有布局和原生聚焦行为，符合 KISS/YAGNI；未引入额外滚动状态、观察器或事件拦截。完整 TypeScript、相关测试与 Chrome 真实组件对照证据见[验证记录](./verify-touch-viewport-scroll.md#2026-10-15-问题选项聚焦导致灰色空白修复验证)。

## 2026-10-17 iPad iOS 15.6 侧栏滑动兼容

本轮先补充[原规格](../features/workspace-viewport/spec.md)的 iOS 15.6 验收条款，再实现代码。旧版 Safari 不支持 `overscroll-behavior`，原有 CSS 不能提供完整的内部滚动边界隔离；原视口快照还直接采用可能为负值的 `offsetTop`。这是源码定位的兼容性缺口，尚未在用户设备上捕获运行数据。

- `src/hooks/use-contained-touch-scroll.ts`：仅当浏览器不支持 CSS overscroll containment 时安装原生监听；根据当前手指方向检查目标到侧栏根节点之间的可滚动容器，无可消费方向时取消纵向默认动作。正常滚动仍由浏览器处理，不手动修改 `scrollTop`，不阻止事件传播。多指、横向、缩放及已处理事件放行；React ref 卸载时清理监听。
- `src/components/layout/sidebar.tsx`：侧栏根节点接入 hook，覆盖固定头尾和工作区/会话内容；工作区列表显式使用 `min-h-0`、`overscroll-contain`。
- `src/hooks/use-visual-viewport.ts`：将负 `offsetTop` 限制为零；合法正偏移与缩放回退保持原语义，移动抽屉复用该修正。
- `tests/unit/lib/contained-touch-scroll.test.ts`、`visual-viewport.test.ts`：补充边界、短列表、嵌套滚动、方向反转、缩放、手势取消、清理及负偏移回归。

KISS/YAGNI：按能力检测提供局部补偿，不引入全局触摸封锁、UA 版本表或滚动模拟器。DRY/SRP：边界判断集中在独立 hook，视口归一化继续由已有 hook 负责；不增加业务数据、接口或配置。

### P1 Review：与 React 捕获阶段的排序处理兼容

审查发现 `useTouchDrag` 在 React 根节点代理的捕获回调中停止传播，侧栏原生 touchstart 无法收到工作区行的起点。此前浏览器夹具未接入排序 hook，未覆盖该冲突。

先补规格和双 hook 集成测试，确认顶部下滑、底部上滑两项失败，再修改 `use-contained-touch-scroll.ts`：touchstart 改到 ownerDocument 捕获阶段，只记录 DOM 属于侧栏的单指触摸；touchend/touchcancel 同样提前清理，避免终止事件被排序处理截断。touchmove 的非 passive 监听仍在侧栏，既有长按排序处理及对页面其他区域的边界不变。

复用原 hook 和原滚动判断，仅调整监听时序与起点过滤，符合 KISS/DRY；没有改写排序协议或增加全局滚动拦截。
