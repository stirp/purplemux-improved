# 按轮加载历史与长消息展开：接口与数据

## 接口或内部通道

- GET /api/timeline/entries：jsonlPath、beforeByte、mode=turn；返回 entries、startByteOffset、hasMore、replaceEntries。
- 保留原条目分页路径；JSONL 路径需要通过允许范围校验。
- GET /api/timeline/sessions 与 GET /api/codex/sessions 的返回契约、排序和隐藏过滤不变；仅优化元数据读取和 Codex 扫描并发。
- 元数据缓存按完整路径与文件状态校验，最多 2000 项；同路径并发加载合并，失败不缓存，文件变化时重新解析。

## 数据与执行边界

- timeline:init 的 sessionStats 可为 null；聊天记录发送后统计通过现有 timeline:stats-update 补齐，过期订阅结果丢弃。
- 浏览器展示缓存按 provider/sessionName/agentSessionId 隔离，12 项、每项 2 MiB、5 分钟 TTL；不缓存 pending 消息，不恢复分页或进程判断。

- 分页边界按对话轮次，不等同于固定条目数。
- 必须区分 Codex 旧模式替换行为与按轮增量模式。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
