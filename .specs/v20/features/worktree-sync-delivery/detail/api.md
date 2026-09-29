# Worktree 同步与 PR/MR 草稿交付：接口与数据

## 接口或内部通道

- POST /api/workspace/worktree-actions：inspectSync、fetch、merge、rebase、continue、abort、saveReview、refreshReview、pushBranch、createDraft。
- merge/rebase 校验 targetHead；createDraft 接受 remote、provider、targetBranch、title、body。

## 2026-09-29 增量：inspectSync 默认值

- 无显式 `targetRef` 时，依次从有效的 `metadata.targetRef`、`metadata.baseRef`、当前 `refs/heads/<branch>` 解析目标。
- `branches` 包含当前本地分支；自身目标返回对应 `targetRef`、`targetHead` 及正常状态下为 0 的 `ahead` / `behind`，无新增接口字段。
- 只读比较允许当前分支；merge/rebase 在解析规范引用后仍以 `targetRequired` 拒绝当前本地分支。
- 无命名分支且无有效默认目标时返回空目标；显式无效目标保留原错误，不静默回退。inspectSync 不写元数据。

## 数据与执行边界

- 同步不修改目标分支；不执行 force push。
- 草稿目前只支持同远程仓库分支，不支持跨 fork 草稿。
- 远程失败显示未知或未确认；远程创建成功但本地关联保存失败时仍保留链接。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
