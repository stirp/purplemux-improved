# Chat 内容区比例宽度实施记录

- 日期：2026-10-12
- 需求：[chat-content-width](../requirements/chat-content-width.md)
- 规格：[timeline-history](../features/timeline-history/spec.md)，CW-01 至 CW-03。
- 顺序：先补充需求、规格、UI、PRD 与任务表，再修改源码。

## 实现

- `src/styles/globals.css` 增加共享 `.chat-content`：`width: 85%`、`margin-inline: auto`，不设置最大宽度。
- `timeline-view.tsx` 的加载骨架与消息区、`web-input-bar.tsx` 的输入区与连接提示、`quick-prompt-bar.tsx`、`agent-status-line.tsx` 使用共享样式。
- 比例基于所在面板，桌面、移动端、分屏共用规则；保留各组件内部 padding 和用户气泡 85% 限制。
- 原有 `max-w-content` 继续用于统计和报告页面；不修改配置或接口。

## 原则与边界

通过单条 CSS 规则复用布局，避免重复比例及新增状态或设置（KISS、DRY、YAGNI）。CSS 负责尺寸，组件保持原有交互职责。
本次不新增实现镜像测试，运行现有相关回归并实际编译生产 CSS；验证结果见[记录](./verify-chat-content-width.md)。
