---
page: workspace-viewport
title: 工作区视口滚动约束
route: '桌面 Web 与移动端工作区'
status: DETAILED
complexity: Low
depends_on:
  - .specs/v20/features/terminal-rendering/spec.md
  - .specs/v20/features/interactive-questions/spec.md
created: 2026-10-13
updated: 2026-10-15
assignee: ''
---

# 工作区视口滚动约束

根据[需求](../../requirements/touch-viewport-scroll.md)，工作区外壳在桌面 Web 和触屏设备中限制文档根节点滚动，防止底部灰色空白或触屏拖动外壳。侧栏、对话和弹层内部保留自然滚动；非工作区页面不受此约束。

## 界面与流程

- 桌面 Web 的工作区根节点保持在视口内，内部滚动不带动整页。
- iPad/iPhone 在非对话区域拖动时外壳不位移；内部滚动方向正常。
- 键盘弹出、关闭及窗口尺寸变化后仍根据 visual viewport 适配可见区域。
- 消息滚动容器建立自己的定位边界，问题卡片的隐藏单选框等绝对定位后代不得越过消息滚动边界，使外层 Panel 产生额外滚动空间；保留原生选项聚焦及键盘操作。

## 验收标准

- 桌面 Web 不出现底部灰色空白；触屏空白区域拖动不移动整个界面。
- 侧栏、对话及弹层内部滚动正常；非工作区页面不受影响。
- 根层滚动规则兼容 `package.json` 中声明的 Firefox 111；离开工作区外壳后恢复其他页面的文档滚动。
- Chrome 长对话中点击 Ask User Question 选项、用键盘切换选项及继续追加内容后，外层 timeline Panel 不产生额外纵向溢出或滚动，输入框和状态栏位置稳定；消息列表仍可正常滚动。
- 浏览器和实机验收未执行时在[验证记录](../../result/verify-touch-viewport-scroll.md)明确标注。

## 实现与记录

- [页面外壳](../../../../src/components/layout/page-shell.tsx)
- [全局样式](../../../../src/styles/globals.css)
- [消息时间线](../../../../src/components/features/timeline/timeline-view.tsx)
- [实施记录](../../result/build-touch-viewport-scroll.md)
- [验证记录](../../result/verify-touch-viewport-scroll.md)
