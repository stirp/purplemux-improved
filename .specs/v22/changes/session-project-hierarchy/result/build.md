# 实施记录

## 实现

- `src/lib/session-workspace-name.ts`：沿父项目关系解析根名称，复用现有名称回退；缺失、循环不猜测根归属。
- `src/components/features/workspace/notification-sheet.tsx`：共享项目路径、标题组件；卡片按归属、标题、辅助信息、操作区排序。使用已有 `useWorkspaceLayouts` 和 `agentTabTitle`，支持当前及其他项目的手动 Tab 名称，历史身份不会借用当前 Tab 标题。
- `src/lib/session-search.ts`：根项目纳入搜索和历史记录匹配；标题匹配继续仅作用于会话本身。
- `src/components/features/workspace/session-history-actions.tsx`：提供可选操作按钮样式，使 Sessions 的删除热区为 44px 并位于卡片右上角；其他使用方保持原样。
- 11 个语言的 `notification.json` 同步增加根项目、项目、未命名会话语义及搜索说明。

## 设计与边界

复用现有项目关系、布局缓存、标题函数、状态保存和删除组件，未引入后端接口或存储字段。名称解析与搜索采用相同派生值，避免两套规则；卡片组件复用于桌面与移动，统一信息层级。原生按钮提供键盘导航，当前会话仍不重复导航。

采用现有语义颜色及字号；根项目使用辅助对比度，项目名稍突出，Tab 标题为主文字。完整名称允许换行，摘要最多两行；选中背景覆盖操作区。移动端搜索、清空、分组、状态选择、删除、历史入口使用至少 44px 热区。

本次先编写增量规格再实施。没有执行 Git 提交、推送、分支操作或发布。
