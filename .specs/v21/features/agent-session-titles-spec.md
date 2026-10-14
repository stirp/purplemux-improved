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

`sessionWorkflow.titles` 按 `provider:sessionId` 保存本应用覆盖标题；尚无 ID 时按 `provider:tab:tabId` 暂存，在当前会话取得 ID 时迁移，即使同一 Tab 以前绑定过其他会话也一样。迁移仅指向当前 ID，并消耗临时标题；已删除身份丢弃临时标题。`PATCH /api/session-workflow` 接收 `{ key, title }`，空标题删除覆盖。Agent Tab 编辑时直接保存覆盖标题，失败不修改原 Tab；编辑当前 Tab 的既有布局名称时成功后清除该名称。已有手动布局名称优先于其他 Tab 写入的会话覆盖标题；没有手动布局名称时按覆盖标题、会话元数据标题、摘要/用户消息、终端进程标题显示。非 Agent Tab 保持现状。删除会话时移除对应标题。
