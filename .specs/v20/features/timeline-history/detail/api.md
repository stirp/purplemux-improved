# 按轮加载历史与长消息展开：接口与数据

## 接口或内部通道

- GET /api/timeline/entries：jsonlPath、beforeByte、mode=turn；返回 entries、startByteOffset、hasMore、replaceEntries。
- 保留原条目分页路径；JSONL 路径需要通过允许范围校验。

## 数据与执行边界

- 分页边界按对话轮次，不等同于固定条目数。
- 必须区分 Codex 旧模式替换行为与按轮增量模式。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
