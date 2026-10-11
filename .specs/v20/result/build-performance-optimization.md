# 0.5.2 性能优化实施记录

- 日期：2026-10-10
- 需求：[性能优化](../requirements/performance-optimization.md)
- 规格：[timeline-history](../features/timeline-history/spec.md)
- 状态：第一轮会话元数据优化已实现；不代表全部性能工作完成

## 问题与测量

旧元数据缓存 30 秒后过期，即使文件未变化，也会重新完整扫描 JSONL。
对 50 个合成 Claude 会话、共 53,503,600 字节的微基准，热读取扫描 0 个文件，模拟经过 31 秒后扫描恢复为 50 个。
测量直接调用真实元数据解析器，模拟时钟推进而不阻塞等待；外部 tmux、日志和 provider 路径转换被隔离。

## 实现入口

- `src/lib/session-meta-cache.ts`：以完整文件路径和 dev/ino/size/mtime/ctime 校验缓存，LRU 上限 2000 项；合并同路径在途请求，失败可重试，读取期间文件变化及主动清理时不回填。
- `src/lib/session-list.ts`：Claude 使用共享元数据缓存，通过 globalThis 跨服务端模块图复用；保留列表扫描、排序和返回字段。
- `src/lib/codex-session-list.ts`：复用消息元数据缓存，统计读取维持原有尾部解析和缓存策略，保留临时失败后的恢复能力；单次列表扫描并发上限 10。
- `src/lib/bounded-concurrency.ts`：抽取 Claude 已有并发执行逻辑供两类会话复用，不引入新依赖。
- 新增三组测试，覆盖文件状态失效、并发合并、清理竞态、LRU、真实文件修改及列表兼容，并提供可复跑微基准。

## 设计原则与边界

共享缓存和并发工具消除重复逻辑；缓存只负责有效性和生命周期，provider 保持各自的解析与统计职责。
本轮保留原分页契约，避免为速度改变隐藏过滤、无效会话处理和总数含义。
不新增虚拟列表、索引数据库或后台扫描服务；文件变化仍完整解析，后续按数据决定是否做增量解析。

检查命令、实测结果和未执行项目见[验证记录](./verify-performance-optimization.md)。
