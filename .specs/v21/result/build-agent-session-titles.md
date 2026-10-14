# Agent 会话标题同步实施记录

2026-10-14：Tab 使用当前会话 ID 对应的元数据标题，回退至代理摘要或用户消息；Sessions 活动项复用同一标题选择函数。手动命名的 Tab 继续由现有 Tab 名称优先显示。入口：`src/lib/agent-session-title.ts`、`src/components/features/workspace/pane-container.tsx`、`src/components/features/workspace/notification-sheet.tsx`。

后续扩展：手动重命名 Agent Tab 通过 `PATCH /api/session-workflow` 保存本应用会话标题覆盖；Tab、会话详情、Sessions 工作状态和历史会话列表共用覆盖标题。尚无会话 ID 时保存 Tab 键，首次绑定迁移；删除会话清理标题。原生 Claude/Codex 文件未改动，其他类型 Tab 继续保存布局名称。

Review 修复：临时标题迁移不依赖 Tab 是否曾绑定会话，当前 ID 到达时消费临时键并只写入当前会话；既有布局中的手动 Tab 名称优先于共享会话标题。删除身份会消费临时键但不写入标题。

PR #36 Review 修复：会话 ID 变化时清理布局、状态管理与客户端的旧摘要/消息，缓存仍按 ID 校验；手动重命名通过一次 session-workflow 请求同时写入标题和当前 Tab 的 `renamedTabs` 标记，显示时忽略该 Tab 的旧布局名，不再发送第二次布局 PATCH。
