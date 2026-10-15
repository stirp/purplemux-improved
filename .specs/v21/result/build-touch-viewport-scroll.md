# 触屏视口滚动约束实施记录

2026-10-13 先依据[需求](../requirements/touch-viewport-scroll.md)补齐视口约定，随后修改 `src/styles/globals.css` 与 `src/components/layout/page-shell.tsx`。2026-10-14 将增量规格和记录归档至[v21 工作区视口规格](../features/workspace-viewport/spec.md)，保留[v20 历史规格](../../v20/features/terminal-rendering/spec.md)。

`page-shell.tsx` 为应用外壳添加 `app-viewport` 标识，`globals.css` 只在外壳存在时关闭 html/body 的溢出与越界滚动，避免桌面 Web 底部露出文档外背景。触屏环境进一步固定文档 body，防止拖动外壳。应用外壳继续依据 visual viewport 定位；侧栏、对话和弹层的内部滚动容器不改变。

验证结果见[验证记录](./verify-touch-viewport-scroll.md)。

2026-10-14 PR #35 Review 修复：Firefox 111 不支持 `:has()`，由 `PageShell` 挂载时给 `html` 添加 `app-viewport-active`，卸载时移除；CSS 改为普通类选择器。新增页面外壳生命周期测试覆盖桌面与移动分支。

## 2026-10-15 问题选项聚焦导致灰色空白

先更新需求、工作区视口规格、PRD 索引与任务表，再修改 `src/components/features/timeline/timeline-view.tsx`：为 `role="log"` 的实际消息滚动容器增加 `relative`。

问题卡片中的 `sr-only` 单选框及 legend 使用绝对定位。原先其定位祖先在消息滚动容器外，导致隐藏控件的溢出计入外层 Panel；点击选项聚焦控件时 Chrome 滚动外层 Panel，随后滚轮可继续滚出底层终端背景。新增定位边界后，隐藏控件留在消息滚动区域内。

采用一个 Tailwind 类完成修正，复用现有布局和原生聚焦行为，符合 KISS/YAGNI；未引入额外滚动状态、观察器或事件拦截。完整 TypeScript、相关测试与 Chrome 真实组件对照证据见[验证记录](./verify-touch-viewport-scroll.md#2026-10-15-问题选项聚焦导致灰色空白修复验证)。
