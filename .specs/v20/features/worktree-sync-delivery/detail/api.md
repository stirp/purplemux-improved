# Worktree 同步与 PR/MR 草稿交付：接口与数据

## 接口或内部通道

- POST /api/workspace/worktree-actions：inspectSync、fetch、merge、rebase、continue、abort、saveReview、refreshReview、pushBranch、createDraft。
- merge/rebase 校验 targetHead；createDraft 接受 remote、provider、targetBranch、title、body。

## 数据与执行边界

- 同步不修改目标分支；不执行 force push。
- 草稿目前只支持同远程仓库分支，不支持跨 fork 草稿。
- 远程失败显示未知或未确认；远程创建成功但本地关联保存失败时仍保留链接。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
