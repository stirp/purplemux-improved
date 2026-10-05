# AI 提交信息、PR/MR 文案与提交确认：接口与数据

## 接口或内部通道

- POST /api/git/commit：inspect、generate、commit；由 session 定位仓库，generate 接受 locale，commit 接收 snapshot 与 message。
- POST /api/workspace/worktree-actions 的 generateDraft 使用 remote、targetBranch、locale 与工作树快照。

## 数据与执行边界

- AI 子进程超时返回 HTTP 504 与 `code: generateTimeout`；保持现有同步生成接口。
- 客户端最多等待 150 秒（含读取响应），兼容 HTTP 408/504、HTML/空错误响应和网络失败；网关时限不由客户端控制。
- 非 JSON 成功响应视为协议错误；提交阶段无法确认结果时使用 `commitUnknown`，不自动重复发送提交。

- 文案生成使用 Claude 无工具模式；模型返回内容须通过结构和长度校验。
- PR/MR 生成不纳入未提交内容；超出证据上限时标记截断，不编造测试结果。
- 快照过期、冲突、Git 操作中或索引锁冲突需阻止提交；提交完成后 hook 异常不得诱导重复提交。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
