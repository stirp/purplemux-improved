# Agent 启动、环境配置与会话绑定恢复：接口与数据

## 接口或内部通道

- /api/config 保存配置；/api/codex/launch-args 提供启动参数与环境。
- /api/status/hook 与 provider runtime snapshot 协同更新会话状态。
- shell-env 继承大小写形式的 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY、NO_PROXY；Codex 的专用环境配置叠加于新启动进程环境。

## 数据与执行边界

- 环境变量只作用于新启动进程，不追改运行中的进程环境。
- review 子会话与根会话身份需区分，不能因子会话 hook 切换面板绑定。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
