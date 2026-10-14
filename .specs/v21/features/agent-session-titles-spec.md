---
page: agent-session-titles
title: Agent 会话标题同步
status: DETAILED
created: 2026-10-14
updated: 2026-10-14
depends_on:
  - ../../v20/features/session-lifecycle/spec.md
---

# Agent 会话标题同步

遵循[需求](../requirements/agent-session-titles.md)。会话详情的元数据缓存按会话 ID 校验后供 Tab 和 Sessions 活动项显示；既有手动 Tab 名称仍可显示，新增手动命名绑定会话标题。历史项在有覆盖标题时显示覆盖值。

## 数据与交互

`sessionWorkflow.titles` 按 `provider:sessionId` 保存本应用覆盖标题；尚无 ID 时按 `provider:tab:tabId` 暂存，在当前会话取得 ID 时迁移，即使同一 Tab 以前绑定过其他会话也一样。迁移仅指向当前 ID，并消耗临时标题；已删除身份丢弃临时标题。`PATCH /api/session-workflow` 接收 `{ key, title, tabId? }`，空标题删除覆盖。Agent Tab 编辑时一次请求保存覆盖标题和当前 Tab 的 `renamedTabs` 标记，失败不修改原 Tab；有标记的 Tab 忽略其既有布局名称。其他 Tab 的手动布局名称优先于共享会话标题；没有手动布局名称时按覆盖标题、会话元数据标题、摘要/用户消息、终端进程标题显示。非 Agent Tab 保持现状。删除会话时移除对应标题。

PR #36 Review 修正：会话身份变更时同步清空上一会话的摘要及用户消息，客户端仅在同一身份的后续更新中采用回退消息。重命名请求同时记录当前 Tab 已改用会话标题，避免另行 PATCH 清除旧布局名称；失败时标题和 Tab 显示都不变。
