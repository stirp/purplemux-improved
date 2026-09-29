# Web 输入联动 CLI 原生命令菜单：接口与数据

## 接口或内部通道

- 复用终端 WebSocket 和现有终端输入通道。
- use-native-commands 与 native-command-completion 协调菜单状态，无独立静态命令列表 API。

## 数据与执行边界

- 可用命令以当前 CLI 版本和会话为准。
- 不把命令菜单内容固化为 Web 端维护的全量列表。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
