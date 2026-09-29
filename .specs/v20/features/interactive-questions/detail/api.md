# Claude/Codex 交互式问题卡片：接口与数据

## 接口或内部通道

- 复用输入队列接口的 send-immediate 与 agentSessionId 校验。
- async-question-answers 与 timeline 数据模型负责答案关联和历史恢复。

## 数据与执行边界

- 会话变化时拒绝旧卡片向新会话提交。
- 已提交答案必须可见，发送失败不伪装成完成。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
