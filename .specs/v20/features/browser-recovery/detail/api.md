# 浏览器存储清理、翻译刷新与异常恢复：接口与数据

## 接口或内部通道

- POST /api/browser-storage 需要 X-Purplemux-Clear-Storage: 1，响应请求清理 HTTP 缓存。
- /api/messages 与 load-client-messages/load-messages 提供客户端翻译加载。

## 数据与执行边界

- 浏览器数据清理不删除服务器 ~/.purplemux 中的工作区和会话数据。
- IndexedDB 不支持枚举或被其他页占用时不能声称全部数据库已删除。
- 一个清理步骤失败不应阻止其他独立步骤尝试。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
