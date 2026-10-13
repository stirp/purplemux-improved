---
page: workspace-viewport
title: 工作区视口滚动约束
route: '桌面 Web 与移动端工作区'
status: DETAILED
complexity: Low
depends_on:
  - .specs/v20/features/terminal-rendering/spec.md
created: 2026-10-13
updated: 2026-10-14
assignee: ''
---

# 工作区视口滚动约束

根据[需求](../../requirements/touch-viewport-scroll.md)，工作区外壳在桌面 Web 和触屏设备中限制文档根节点滚动，防止底部灰色空白或触屏拖动外壳。侧栏、对话和弹层内部保留自然滚动；非工作区页面不受此约束。

## 界面与流程

- 桌面 Web 的工作区根节点保持在视口内，内部滚动不带动整页。
- iPad/iPhone 在非对话区域拖动时外壳不位移；内部滚动方向正常。
- 键盘弹出、关闭及窗口尺寸变化后仍根据 visual viewport 适配可见区域。

## 验收标准

- 桌面 Web 不出现底部灰色空白；触屏空白区域拖动不移动整个界面。
- 侧栏、对话及弹层内部滚动正常；非工作区页面不受影响。
- 浏览器和实机验收未执行时在[验证记录](../../result/verify-touch-viewport-scroll.md)明确标注。

## 实现与记录

- [页面外壳](../../../../src/components/layout/page-shell.tsx)
- [全局样式](../../../../src/styles/globals.css)
- [实施记录](../../result/build-touch-viewport-scroll.md)
- [验证记录](../../result/verify-touch-viewport-scroll.md)
