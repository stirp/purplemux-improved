---
page: codex-terminal-provider-identity
title: Codex 切换 Terminal 时保留正确代理身份
status: DETAILED
created: 2026-10-20
depends_on:
  - ../../../v20/features/agent-runtime/spec.md
  - ../../../v19/features/codex-panel-ui/spec.md
  - ../claude-terminal-mode-detection/spec.md
  - ../local-agent-process-management/spec.md
---

# Codex 切换 Terminal 时保留正确代理身份

## 原始需求

“移动端新建的 Codex 会话再发消息出去的时候，切换到 terminal，反而会把会话认为是 Claude 会话，导致无法切换回 chat”。

## 行为与边界

- 增量修正 Agent 运行检测与会话绑定：以真实可执行文件或已知 Node/Bun CLI 包装器识别代理，不以整条命令行包含 `claude` / `codex` 判定。复用本机进程管理的识别规则与 process-utils 参数读取入口，Linux 保留 argv 边界。
- 同一规则用于 Claude 运行检测、PID 文件校验、resume 回退和 Codex 运行检测、会话绑定；提示词、工作目录、shell 命令及普通工具参数不改变代理身份。
- 兼容 Node/Bun 通过 npm bin 软链接启动：脚本绝对路径解析后仍须匹配已知 CLI 包路径；软链接失效或指向普通脚本不认作代理。
- 替代 claude-terminal-mode-detection 中本次涉及的“不修改服务端检测算法”边界；菜单实时检测、超时、时间戳保护、切换锁及进程退出后的启动入口保持原样。Chat / Terminal 只改变视图，不启动另一代理或替换会话。
- 保留既有进程树扫描限制、持久化格式、CLI 工作状态和 Codex 根会话策略。不扩展任意 CLI 包装器识别，不调整 provider 扫描优先级。

## 验收标准

1. Codex 参数含 Claude 名称或子进程搜索 Claude 时，检测接口仍返回 Codex；真实 Claude（含已知 Node 包装器、嵌套 shell）仍可识别。
2. 普通 shell、搜索工具、无关 Node 脚本不因参数提到代理被认作代理；两种代理均覆盖。失效 PID、非 Claude 进程参数中的 Claude resume 文本不能产生 Claude 会话绑定。
3. 移动端和桌面 Codex Chat → Terminal → Chat 返回 `codex-cli`，保留原会话 ID，不派发启动事件；刷新无缓存、退出、失败和超时沿用既有回归。
4. 运行相关测试、完整 TypeScript、改动文件 ESLint 和生产构建，记录实际结果与未执行的实机验收。

## Review P2：macOS 含空格安装路径

- 替代 macOS 按空白拆分 `ps args` 的回退：通过现有 Koffi 依赖调用 `sysctl(KERN_PROCARGS2)`，按内核提供的 argc 与 NUL 分隔读取 argv。可执行文件、npm 包路径、软链接路径中的空格、中文、引号均保留；空参数不能被过滤而改变脚本参数位置。
- 先查询 `KERN_ARGMAX` 限定缓冲区，校验返回长度和 argc，仅读取 argv，不把后续环境变量作为参数。失败、非法 PID、截断或不支持的平台返回空数组，不从有歧义的展示文本猜测身份。
- 参数不可读或身份不匹配时跳过 Claude PID 注册，不因这次校验失败删除注册；原有进程已不存在的清理路径保持。
- 验证完整 macOS 参数读取到代理分类链路，覆盖原生 Claude/Codex、Node/Bun 包装与 npm 软链接、提示词误判、空参数、环境区隔离、读取失败及有效 Claude PID 注册保留。自动化模拟原生 ABI，不冒充 macOS 实机验证。

见[任务](./task.md)与[实施及验证](./result.md)。
