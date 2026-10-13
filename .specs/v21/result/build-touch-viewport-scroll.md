# 触屏视口滚动约束实施记录

2026-10-13 先依据[需求](../requirements/touch-viewport-scroll.md)补齐视口约定，随后修改 `src/styles/globals.css` 与 `src/components/layout/page-shell.tsx`。2026-10-14 将增量规格和记录归档至[v21 工作区视口规格](../features/workspace-viewport/spec.md)，保留[v20 历史规格](../../v20/features/terminal-rendering/spec.md)。

`page-shell.tsx` 为应用外壳添加 `app-viewport` 标识，`globals.css` 只在外壳存在时关闭 html/body 的溢出与越界滚动，避免桌面 Web 底部露出文档外背景。触屏环境进一步固定文档 body，防止拖动外壳。应用外壳继续依据 visual viewport 定位；侧栏、对话和弹层的内部滚动容器不改变。

验证结果见[验证记录](./verify-touch-viewport-scroll.md)。
