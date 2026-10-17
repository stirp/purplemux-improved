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
updated: 2026-10-17
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

## 2026-10-17 iPad iOS 15.6 兼容修正

用户反馈：“在 iPad iOS 15.6 版本上，手指沿着工作侧边栏往下滑，屏幕会往上移”，照片显示应用整体上移后底部露出空白。本次延续触屏视口需求，不改变侧栏内容或排序规则。

- 在不支持 `overscroll-behavior` 的浏览器中，为桌面布局的工作侧栏补充原生触摸边界保护；列表中部保留自然方向滚动，列表顶部向下、底部向上及无可滚动内容时不得把手势传给页面。
- 保护范围包含侧栏头部、底部及工作区/会话列表；嵌套可滚动区域仍可消费手势，不干扰侧栏之外的对话、终端或 Portal 弹层。
- 继续支持点击、长按菜单和排序；多指缩放、缩放后的视口平移及横向手势不被纵向边界保护拦截，组件卸载后移除监听。
- 工作区行的 React `onTouchStartCapture` 即使停止传播，边界保护也必须先记录侧栏内的触摸起点；侧栏外或 Portal 的起点不得启用保护。通过同时挂载真实 `useTouchDrag` 和边界保护 hook 的集成测试验证，不能仅用独立监听器夹具代替。
- `visualViewport.offsetTop` 的负值不得把外壳移出屏幕顶部；合法的正偏移继续用于软键盘避让，缩放时沿用 CSS 回退。
- 验证覆盖滚动中部、上下边界、短列表、嵌套容器、方向反转、手势取消、卸载清理和视口偏移；浏览器模拟与 iOS 15.6 实机结果分别记录。

后续修正进度见[需求任务](../../changes/touch-viewport-scroll/task.md)。

## 实现与记录

- [页面外壳](../../../../src/components/layout/page-shell.tsx)
- [全局样式](../../../../src/styles/globals.css)
- [消息时间线](../../../../src/components/features/timeline/timeline-view.tsx)
- [实施记录](../../result/build-touch-viewport-scroll.md)
- [验证记录](../../result/verify-touch-viewport-scroll.md)
