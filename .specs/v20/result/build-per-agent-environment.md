# 按代理环境配置：实施记录

日期：2026-09-29。关联[需求](../requirements/per-agent-environment.md)。

- 数据：新增 claudeEnvironment，保留 codexEnvironment；配置 API 共用校验，store 共用保存逻辑并分别初始化、更新。
- 界面：复用 AgentEnvironmentSettings，两个实例独立维护草稿、错误和保存状态；11 种语言通过 agent 参数显示对应名称。
- 运行：浏览器与服务端 Claude 命令构建共用 Node 包装器，执行时读取 config.json，仅向子进程叠加 Claude 配置；保留 shell 函数的登录 shell 回退。Codex 保持现有 launcher。
- 内部调用：callAgentText 按 provider 读取环境，调用方显式覆盖优先；Codex 不支持的 textOnly 调用仍提前拒绝。
- 原则：共用编辑器、校验与保存逻辑避免重复；沿用现有字段和配置文件，无迁移、额外依赖或新接口。
- 文档：同步 PRD、任务表、agent-runtime spec/ui/flow/api、覆盖索引和 DATA-DIR。

未执行生产构建、部署或 Git 提交。验证见[记录](./verify-per-agent-environment.md)。

## Review 修复

- `session-detection.ts` 使用带去重的完整后代遍历，修复额外启动包装层使真实 PID 超出原两层扫描范围的问题。
- `launcher.ts` 在登录 shell 初始化完成后通过 fd 3 应用字面量环境赋值，修复 rc 文件覆盖用户配置的问题；POSIX shell 与 fish 分别处理转义，管道写入完成后关闭，不占用标准输入。
- 补充深层会话 PID 绑定、恢复参数、重复 PID、无关 PID，以及四类真实 shell 的环境优先级与输入保留回归测试。

## export 前缀兼容

解析器在键值切分前移除可选的 export 前缀（允许前导空白，export 后至少一个空格或 tab）。复用原有名称、重复键和 NUL 校验，值继续按字面量保留；同步 11 种语言的输入提示。

## Shell 转义可审阅性修复

使用 String.raw 保存启动脚本，移除 String.fromCharCode，改用明确的单引号和反斜杠字面量。前后端构建器传递参数数组，共享外层逐项转义，修复 workspace/resume 参数直接拼接到 shell 命令的问题；路径的 ~/ 展开移入 Node。保留直接 spawn 和仅 ENOENT 时的 shell 函数回退。

## Review 4–10 修复

新增配置根节点守卫、4 MiB 有界读取及明确诊断；启动脚本序列化共享环境校验函数。新增仅服务于代理文本调用的目录监听缓存，应用写入同步失效，globalThis 保证跨模块图一致，监听失败回退实时读取。显式 provider 字段映射替代模板 key，并在 store 中跳过相同值保存。补充跨代理专属键排除、缓存失效/并发/副本隔离、非对象根值、超限及读取期间增长、共享校验一致性测试。


## 2026-09-30 管道、扫描与文件边界复审

- fd 3 环境脚本增加完整性结束标记与赋值成功检查；Fish 同时检查 cat/source 的 pipestatus，POSIX 保留 cat 退出状态。失败打印诊断并停止启动。
- 新增 fd 4 就绪确认；120 秒定时器等待环境应用确认而非仅等待管道写完。失败或超时关闭管道、SIGKILL 回退 shell 并退出。
- Fish 改用实际 status fish-path 能力探测，探测上限 5 秒。
- PID 遍历上限为 16 层/1024 候选/16 个并发查询，保留去重与根 PID 排除。
- ConfigStore 与启动器对齐 4 MiB 有界读取，写入按 UTF-8 最终序列化大小拒绝超限；读取超限不作为缺失文件吞掉。配置缓存改用文件元数据监听，每秒检查，仅配置文件元数据变化或应用写入时失效。
- 不采纳两项误判：export=value 是合法名称赋值，已转义；kill -0 不触发 child exit，不能据此忽略真实终止信号。
