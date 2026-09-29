# 终端流控与移动端视口：接口与数据

## 接口或内部通道

- terminal-protocol、terminal-write-queue 与 terminal-server 定义终端传输及消费确认。
- use-terminal-websocket 和 use-terminal 连接浏览器解析完成与服务端流控。

## 数据与执行边界

- 收到 WebSocket 数据不等同于终端已经解析完成，确认不能过早。
- 连接关闭或重建时需清理旧队列与确认状态，避免错误作用于新连接。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
