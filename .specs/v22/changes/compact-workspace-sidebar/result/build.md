# 实施记录

日期：2026-10-16。先读取基线并编写本需求规格，再实施代码。

## 变更入口

- `src/components/layout/sidebar.tsx`：本地化标签、搜索输入、过滤结果、拖拽保护、分组留白、弹性品牌与标签栏高度。
- `src/components/features/workspace/workspace-item.tsx`：单行工作区、紫色选中态、完整名称/目录/分支/端口提示和无障碍标签，复用既有菜单及工作树管理。
- `workspace-group-header.tsx`：计数右对齐、键盘展开、聚焦时展示菜单、搜索期间禁用拖拽。
- `workspace-status-indicator.tsx`：显式 `compact` 展示模式；复用既有聚合规则，不改变移动端默认模式。
- `workspace-tree-guides.tsx`、`src/styles/globals.css`：树轨道跟随行高中线；桌面按钮按需显示；容器宽度和相对字号决定状态文字是否收起。
- `src/lib/workspace-search.ts`：纯函数匹配名称、路径与分支，保留祖先并防止循环。
- `messages/*/sidebar.json`：补齐全部 11 种现有语言的侧栏及状态文案。
- `docs/STATUS.md`：说明桌面紧凑状态的呈现优先级及与工作阶段的关系。

## 设计取舍

- KISS / YAGNI：沿用现有工作区结构和主题令牌；不新增设置、接口、持久化字段或依赖，不实现预览以外的最近访问/置顶功能。
- DRY：复用工作状态聚合、原菜单、管理弹窗和字体 CSS 变量；移动导航继续使用原展示模式。
- 单一职责：搜索只返回可见/展开集合，不修改分组偏好；组件负责渲染和输入交互。
- “审批中”保持已有工作阶段含义；真正等待输入时显示“待输入”，避免把阶段等同于权限确认。

## 环境与交付

- 使用 `pnpm install --frozen-lockfile --ignore-scripts` 安装锁定依赖，未修改 package.json 或锁文件。
- 浏览器使用单独的 `compact-sidebar` 会话及 `/tmp/purplemux-compact-sidebar-review` 测试数据；通过仅作用于验证进程的 `os.homedir()` 预加载隔离，不修改用户 HOME。
- 未提交 Git、推送、切换分支、发布或重启用户当前运行实例。
- 验证证据见 [verify.md](./verify.md)。

## 审查修正（2026-10-16）

- 搜索结果始终绑定 `useTouchDrag`；hook 根据最近的显式 `draggable` 节点决定是否允许拖拽，`draggable=false` 仍能使用原有长按菜单状态机。
- `startTouchDrag` 的 `dragEnabled` 仅控制拖拽启动；静止长按、释放点击保护、菜单首次操作及清理继续复用原逻辑。禁用拖拽时移动手指取消长按并允许滚动。
- 删除 200px 以下侧栏在 hover/focus/menu-open 时隐藏整个状态元素的规则；保留原有状态文字收起逻辑，状态图标及 title/aria-label 始终存在。
- 扩展真实组件触摸测试矩阵，覆盖桌面、桌面搜索和移动导航；增加禁用拖拽后的移动测试。
- 遵循 KISS/DRY：不新增手势定时器或菜单实现，不复制状态提示，不增加依赖或配置。
