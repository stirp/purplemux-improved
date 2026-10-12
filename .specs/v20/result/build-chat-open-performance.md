# 聊天打开性能实施记录

- 日期：2026-10-12
- 需求：[performance-optimization](../requirements/performance-optimization.md)
- 规格：[timeline-history](../features/timeline-history/spec.md)，PERF-OPEN-01 至 05。

## 实施

- 桌面 pane-container 提前挂载 Claude/Codex 聊天，不等待终端 ready/首次连接。移动端源码原本已并行挂载，因此不改其终端连接门槛；输入栏原有连接保护保留。
- timeline-server 解析最近一轮后调用 timeline-initial-delivery 立即发送 init；统计独立读取并通过既有 stats-update 补齐。按连接订阅版本、JSONL 路径和连接关闭状态拒绝过期统计；客户端同步校验 session ID，兼容 init 和 stats 同批到达。
- timeline-display-cache 使用 provider、tmux session、Agent session ID 组成键，最多 12 项，每项 JSON UTF-16 估算最多 2 MiB，5 分钟 TTL，按最近访问淘汰。只保留最近已确认轮次，不保存 pending 消息或持久化到 localStorage。
- useTimeline 初始化时先显示同会话缓存，同时正常建立 WebSocket；进程状态保持独立判断，分页游标和 JSONL 路径必须等新 init 后才恢复。新 init 替换缓存；切换、结束和 resume 清理旧数据，过期统计及旧连接结果丢弃。
- 服务端 timeline debug 日志新增会话检测、路径定位（累计）、历史 init 发送、统计读取耗时；只记录耗时、provider 和条目数，不记录消息内容。沿用现有 LOG_LEVELS 的 timeline=debug 设置。

## 原则与范围

复用现有 stats-update 通道、WebSocket 生命周期和按轮解析，不新增接口或后台保活连接。展示缓存与安全/进程判断分离，保持缓存只负责展示；容量和失效约束明确。未改长轮次分组、消息渲染、滚动锚点及终端发送行为，后续依据主线程测量决定是否渐进渲染。

实际检查及限制见[验证记录](./verify-chat-open-performance.md)。
