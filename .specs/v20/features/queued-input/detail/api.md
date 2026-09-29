# 排队输入、立即提交与长文本粘贴：接口与数据

## 接口或内部通道

- GET/POST/DELETE /api/input-queue，查询参数为 workspaceId 和 tabId。
- POST 支持默认入队、submit-now 以及带 agentSessionId 校验的 send-immediate。
- 消息上限为 100000 字符和 20 个附件；DELETE 接受消息 id。

## 数据与执行边界

- inactive/unknown 状态不能普通入队；无效消息、队列已满和会话变化需要返回错误。
- 立即回答必须绑定当前 Agent 会话，不能发送到已切换的会话。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
