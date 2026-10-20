# 实施及验证

## 实施

- 根因：`isClaudeRunning` 对整个进程命令行做 `includes('claude')`，`check-agent` 先检查 Claude，Codex 参数或工具子进程中出现 Claude 字样会被误判。Codex 的对称检测也存在子串匹配问题。
- 将本机进程管理已有 `classifyAgentArgv` 提取到 `src/lib/agent-process-identity.ts`，原导出保持兼容；共用 `process-utils.getProcessArgv`，其入参收窄为实际使用的 PID 和命令行字段。遵循 DRY，避免两套身份规则；不增加持久化状态或菜单特判。
- Claude 运行检测、PID 注册校验、resume 回退，以及 Codex 运行检测、会话绑定统一使用真实可执行文件／已知 CLI 脚本身份。
- npm bin 软链接脚本解析到真实包路径后再分类；失效链接与普通脚本不匹配，保留 npm 安装方式的兼容性。
- 同步 `docs/STATUS.md` 中的代理识别说明。

## 验证

2026-10-20 在当前工作树执行：

- 修复前运行新增 `agent-provider-detection.test.ts`：12 项失败；其中检测接口明确将 Codex 返回为 `providerId: claude`、`providerPanelType: claude-code`，复现误判。
- 修复后首次执行下列 8 个测试文件，共 59 项通过；补充 npm bin 软链接兼容后重新执行，最终 62 项通过：

```bash
pnpm exec vitest run tests/unit/lib/agent-provider-detection.test.ts tests/unit/lib/agent-mode-detection.test.ts tests/unit/lib/claude-session-detection.test.ts tests/unit/lib/codex-session-detection.test.ts tests/unit/lib/codex-active-session-fallback.test.ts tests/unit/lib/local-agent-session.test.ts tests/unit/lib/local-agent-processes.test.ts tests/unit/lib/process-utils-list.test.ts
```

| 验收 | 本次证据 |
| --- | --- |
| 1：Codex 不被当作 Claude | 真实 check-agent handler + 两种 provider 检测函数，mock 进程树、参数及文件系统；原生／Node Codex 参数含 Claude、后代 rg 搜索 Claude 均返回 Codex |
| 2：无关进程不冒充代理 | shell、搜索工具、普通 Node 脚本、Node 内联脚本、路径带代理名称、Claude PID 被 Codex 复用；Claude 原生／Node／Bun 正向检测；npm bin 软链接与失效链接；原有深层 shell 与 resume 绑定回归 |
| 3：可返回 Codex Chat | 真实移动 MobileTabHeader 与桌面 AgentModeSwitcher 的 jsdom 交互，Codex → Terminal → Chat 保持 provider/session ID，无启动事件；既有刷新、退出、网络异常、3 秒超时、迟到响应测试通过 |
| 4：静态检查与构建 | 改动的 9 个 TS 文件 ESLint 通过；`pnpm exec tsc --noEmit` 完整类型检查通过；`pnpm build` 在软链接兼容调整前后均通过，含 Next.js、静态页面生成、post-build 和 tsup |

- `git diff --check` 与本需求文档链接检查通过。
- 构建存在多 lockfile 导致 Next.js 推断工作区根目录的提示，不影响本次构建成功。

ESLint 命令：

```bash
pnpm exec eslint src/lib/agent-process-identity.ts src/lib/local-agent-session.ts src/lib/process-utils.ts src/lib/providers/claude/session-detection.ts src/lib/providers/codex/session-detection.ts tests/unit/lib/agent-provider-detection.test.ts tests/unit/lib/agent-mode-detection.test.ts tests/unit/lib/claude-session-detection.test.ts tests/unit/lib/codex-active-session-fallback.test.ts
```

### 验证范围

- 组件交互使用 jsdom，未运行手机真机或真实浏览器；未向真实 Codex／Claude 会话发送消息。
- 初次实现的进程检测回归使用隔离 mock；当时 macOS 仍沿用命令行分词回退，未执行 macOS 实机验证。该回退已在下述 Review P2 中替换。
- 工作树中同时存在本机进程管理／闲置回收的其他改动；本记录仅描述此需求的实施，类型检查与构建以当前工作树为范围。

## Review P2：macOS 含空格路径修复

### 实施

- `src/lib/darwin-process-argv.ts` 通过现有 Koffi 调用 macOS `sysctl`，先读取 `KERN_ARGMAX` 分配有上限的缓冲区，再读取 `KERN_PROCARGS2`；校验长度、argc、NUL 结束边界，只返回声明数量的参数，不暴露环境区。
- `process-utils.getProcessArgv` 在运行时判断平台，避免 Next.js 将构建机平台折叠进产物；macOS 原生读取、Linux procfs 均保留空参数与含空格路径，不再按空白拆分 `ps` 展示文本，读取失败返回空数组。
- Claude 的 PID 注册遇到身份校验失败只跳过，不删除，避免参数不可读时误删有效记录；真实非 Claude 进程仍不可绑定为 Claude。
- 原生读取单独封装，调用方继续复用 process-utils 与已有身份分类，未新增依赖或展示层特判。

### 本次验证

- 新增 `process-argv.test.ts` 的首轮 21 个用例在修复前失败，含空格路径被拆开的断言复现 review；修复并补齐返回长度／截断测试后，该文件共 25 项通过。
- 相关 11 个文件共 **119 项通过**，包含 macOS 原生 argv 到真实身份分类及 Claude PID 绑定、空参数与环境区隔离、失效库／读取拒绝／截断／非法长度、Linux 参数边界、移动与桌面切换、既有本机进程管理及闲置回收回归。

```bash
pnpm exec vitest run tests/unit/lib/process-argv.test.ts tests/unit/lib/agent-provider-detection.test.ts tests/unit/lib/claude-session-detection.test.ts tests/unit/lib/codex-active-session-fallback.test.ts tests/unit/lib/local-agent-processes.test.ts tests/unit/lib/local-agent-session.test.ts tests/unit/lib/agent-process-manager.test.ts tests/unit/lib/idle-tab-reclaimer.test.ts tests/unit/lib/agent-mode-detection.test.ts tests/unit/lib/codex-session-detection.test.ts tests/unit/lib/process-utils-list.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/lib/process-utils.ts src/lib/darwin-process-argv.ts src/lib/providers/claude/session-detection.ts tests/unit/lib/process-argv.test.ts
pnpm build
```

- 本轮改动文件 ESLint、完整 TypeScript 检查、生产构建（Next.js、静态页面生成、post-build、tsup）均通过。构建仍有已有的多 lockfile 根目录推断提示，不阻断构建。`git diff --check` 和需求文档链接检查通过。
- 限制：当前环境为 Linux，macOS 系统调用使用 mock 模拟 ABI 与数据布局，未执行 macOS 实机测试、真实浏览器或手机验收；未将初次实现或 reviewer 的历史结果视为本轮运行证据。
