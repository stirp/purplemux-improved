# 实施记录

日期：2026-10-17。先补齐本需求规格，再实现排序；审查修正继续维护同一需求。

- `src/components/features/workspace/terminal-commands-bar.tsx`：复用已有 dnd-kit，为管理弹窗增加独立手柄、纵向排序、鼠标/触摸及键盘操作。保存成功才更新列表；失败提示并重新读取配置。
- `src/hooks/use-terminal-commands.ts`：既有 SWR 保存流程增加类型约束的 PUT 请求，保留共享缓存、广播和重连刷新。
- `src/pages/api/terminal-commands.ts`：PUT 接受 ID 数组；校验类型、长度、数量和唯一性，成功返回完整列表。
- `src/lib/workspace-store.ts`：复用文件锁和原子写入，只排序最新命令对象；过期 ID 集合返回 409，保留其他字段及并发内容更新。
- `messages/*/terminal.json`：全部 11 个语言目录增加手柄、操作说明和失败反馈；简中、繁中、英文提供对应文案，其余沿用英文回退惯例。

## 审查修正

- Escape：使用 Base UI `onOpenChange` 的 `cancel()` 阻止关闭，并在拖动时通过 `allowPropagation()` 将 Escape 继续传给 document 上的 KeyboardSensor。取消后恢复关闭能力。
- 方向键：拖动期间对上下方向键调用 Popup 事件的 `preventBaseUIHandler()`，跳过 Base UI 默认的冒泡拦截，保留原生事件传给拖拽传感器。
- 状态生命周期：拖动期间禁用新增、编辑、删除和删除确认/取消，避免上下文卸载或列表变化留下活动拖拽状态。
- 测试：键盘事件默认从实际聚焦元素派发，不再直接向 document 发事件；覆盖取消后关闭、编辑/新增互斥、恢复及实际键盘移动。

## 原则应用

- KISS / YAGNI：不增加依赖、排序字段或配置迁移，仅扩展现有列表与保存接口。
- DRY：复用桌面/移动组件、dnd-kit、SWR、工作区锁和广播。
- 单一职责：排序手柄封装拖拽显示，API 校验请求，存储层负责并发一致性；弹窗仅协调交互状态。
