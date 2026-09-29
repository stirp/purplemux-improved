# Agent 启动、环境配置与会话绑定恢复：接口与数据

## 接口或内部通道

- /api/config 保存配置；/api/codex/launch-args 提供启动参数与环境。
- /api/status/hook 与 provider runtime snapshot 协同更新会话状态。
- shell-env 继承大小写形式的 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY、NO_PROXY；Codex 的专用环境配置叠加于新启动进程环境。

## 数据与执行边界

- 环境变量只作用于新启动进程，不追改运行中的进程环境。
- review 子会话与根会话身份需区分，不能因子会话 hook 切换面板绑定。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。

## 按代理环境数据契约

GET /api/config 返回可选的 claudeEnvironment、codexEnvironment（Record<string, string>）。PATCH 可独立更新任一字段；空对象清空该代理配置，未提交字段保持不变。名称匹配 ^[A-Za-z_][A-Za-z0-9_]*$，值必须为不含 NUL 的字符串；非法请求返回 400，校验全部通过后才写入。持久化继续使用 config-store 的 config.json 写入流程。

Claude 启动包装器直接读取同一配置文件，不新增 HTTP 接口；Codex /api/codex/launch-args 仅返回 codexEnvironment。两者均使用继承环境加对应覆盖值，不修改 process.env。callAgentText 合并次序为继承环境、对应代理配置、调用方显式环境。

Claude shell 回退使用独立管道传递赋值内容，在 rc 文件初始化之后应用；不增加 API 或配置字段。进程候选采集从固定两层扩展为去重的广度优先后代扫描，两种检测入口一致。

## 缓存与校验补强

getAgentEnvironment 仅缓存内部代理文本调用的配置读取，并合并并发首次读取。缓存与文件元数据 watcher 存于 globalThis；config.json 的 mtime/ctime/inode/size 改变或应用成功写入时缓存失效，watcher 失败则关闭并重试，无法监听时不缓存。其他 getConfig/readConfig 调用保持原行为。

启动器将无外部依赖的 isValidAgentEnvironment 函数序列化到 Node 脚本中，复用 API 的真实实现而非复制规则。读取同一文件描述符先检查大小，再以最多 4 MiB + 1 字节检测超限；finally 关闭描述符。配置根值必须为 JSON 对象，明确区分读取失败、无效 JSON、根类型错误、大小超限与无效环境配置。


## 2026-09-30 边界补强

- 配置存储与启动器读侧均执行 4 MiB 有界读取，同一描述符检查大小并限制实际读取量，文件增长不能突破限制。writeConfig 按最终序列化 UTF-8 字节数校验，超限不写文件、不广播；超限读取明确抛错，不能当作缺失配置覆盖。
- getAgentEnvironment 使用 watchFile 仅检查 config.json 自身元数据，每秒一次；不再依赖目录事件的 filename。外部修改与原子替换最多约一秒内失效，应用成功写入仍立即失效；缓存读取失败后允许重试。
- 回退 shell 的 fd 3 传送带完整性结束标记的环境赋值；必须校验读取、赋值和结束标记，再通过 fd 4 返回确认。启动器等待确认最多 120 秒，管道错误或超时打印明确诊断、终止回退 shell 并退出。
- Fish 使用 5 秒超时的 `status fish-path` 能力探测，兼容改名后的可执行文件，不依赖 basename；不支持在 rc 任意接管命令的情况下推断最终 shell，无法完成握手时明确失败。
