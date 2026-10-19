# 验证记录

## PR #71 目标终端重检（2026-10-20）

- 对应[评审问题](https://github.com/stirp/purplemux-improved/pull/71#discussion_r4315906343)：等待原进程退出期间目标可能被其他浏览器使用，旧的 shell/目录检查不足以保护投递。
- 复用目标校验函数，在停止前、stopped 保存后、dispatching 保存后分别核验目标布局映射、pane PID、前台 shell、工作目录和最近输入。停止后校验失败不投递，保留 stopped；dispatching 已保存但明确未发送时回写 stopped。真正发送失败仍保留 dispatching，避免重复投递。
- 新增参数化回归：目标变忙、目录变化、pane 替换、布局移除、新输入均不发送且不绑定；恢复目标后重试只发送一次，不重复建 Tab/停止源进程。另覆盖 dispatching 写入期间目标变化后的回退。
- 本次执行以下测试命令，12 个文件、82 项全部通过，包含闲置回收的另一项评审修复：

```bash
pnpm exec vitest run tests/unit/lib/idle-agent-shutdown.test.ts tests/unit/lib/idle-tab*.test.ts tests/unit/lib/agent-process*.test.ts tests/unit/lib/local-agent*.test.ts tests/unit/lib/process-utils-list.test.ts tests/unit/lib/tmux-paste.test.ts tests/unit/lib/layout-empty-workspace.test.ts tests/unit/lib/workspace-delete.test.ts
pnpm tsc --noEmit
pnpm exec eslint src/lib/idle-agent-shutdown.ts src/lib/idle-tab-reclaimer.ts src/lib/agent-process-manager.ts src/lib/tmux.ts tests/unit/lib/idle-agent-shutdown.test.ts tests/unit/lib/idle-tab-reclaimer.test.ts tests/unit/lib/agent-process-manager.test.ts
git diff --check
```

- 完整类型检查、ESLint、差异检查通过，`pnpm build` 通过（Next.js 编译、静态页面生成、post-build、服务端 tsup 均完成）。信号与 tmux 在测试中模拟，未操作真实用户进程，未执行 macOS 实机和浏览器验证。没有 UI/API 形状变更；跨进程最终检查与投递不宣称原子冻结外部输入。

## 自动化检查

2026-10-19 在当前工作树执行：

```bash
pnpm exec vitest run \
  tests/unit/lib/local-agent-session.test.ts \
  tests/unit/lib/local-agent-processes.test.ts \
  tests/unit/lib/agent-process-manager.test.ts \
  tests/unit/lib/agent-process-api.test.ts \
  tests/unit/lib/process-utils-list.test.ts \
  tests/unit/lib/workspace-delete.test.ts \
  tests/unit/lib/layout-empty-workspace.test.ts \
  tests/unit/lib/claude-session-detection.test.ts \
  tests/unit/lib/codex-session-detection.test.ts \
  tests/unit/lib/layout-workspace-api.test.ts
pnpm tsc --noEmit
pnpm exec eslint <本需求全部改动的 TypeScript/TSX 文件>
pnpm build
git diff --check
```

- 单元测试：最终 10 个文件共 53 项通过，包含持久化/独立子进程回归。
- 完整 TypeScript 检查通过，改动文件 ESLint 通过。
- 规格链接、11 份语言目录的 JSON/词条键完整性及差异空白检查通过。
- 最终源码的 `pnpm build` 通过：Next.js 完整类型检查（78 秒）、页面/API 编译（56 秒）、24 个静态页面生成、post-build 和 tsup 均成功；产物包含 `/api/system/agent-processes`。

## 验收映射

| 验收 | 证据 |
| --- | --- |
| 进程识别与归属 | 原生/Node 包装器、提示词误匹配、嵌套祖先、循环、独立原生子进程测试；真实 Linux 只读扫描 |
| 可靠会话 | 打开文件、Claude PID/cwd/启动时间匹配、明确 resume 参数、歧义、子代理、不可读文件与自定义根拒绝测试 |
| 停止与接入顺序 | mock 信号测试断言准备保存 → SIGTERM → 退出 → stopped/dispatching 保存 → 恢复命令；从不对真实 PID 发信号 |
| 失败保护 | 安装/权限/保存失败不停止，PID 复用或会话变更拒绝，超时不恢复、不升级信号 |
| 重试/持久化 | 并发请求只发送一次；不确定交付禁止重发，识别同一目标后完成；保存阶段不重复记录、不覆盖目录变更，损坏文件保留 |
| API | 请求校验、显式确认、跨站拒绝、405、409、no-store |
| 桌面/移动界面 | 实际组件隔离浏览器验证及截图，详见下文 |

## 浏览器验证

使用 agent-browser 独立会话 `pmux-local-process-management`，将实际 `AgentProcessSettings`、next-intl、shadcn 组件及项目 CSS 打包至临时目录；HTTP fixture 仅监听 `127.0.0.1:18379`。进程/API 返回为隔离测试数据，没有连接真实操作接口。CLI 的 `skills get core` 不可用，使用已读取的本地 core 技能操作指南。

- 1280×900 桌面、390×844 移动视口；页面 scrollWidth 等于视口宽度，无横向溢出。
- 目录和会话 ID 长文本换行；未知目录/会话显示原因，接入按钮禁用。
- 键盘输入 codex 后隐藏 Claude 行，保留 Codex 行。
- 打开接入确认框以及取消后 POST 数量均为 0。
- 确认后恰好一个请求，包含 PID、启动时间、action 与 confirmed；模拟 409 后确认框保留并显示错误。
- 模拟成功后确认框关闭，进入既有工作区切换调用。
- 浏览器运行错误为空。隔离服务未提供应用字体和 favicon，出现对应资源 404，截图使用回退字体；这不是完整应用端到端验收。
- [桌面截图](./desktop.png)、[移动截图](./mobile.png)。验证完成后关闭浏览器会话与临时 HTTP 服务。

## 实机检查及限制

- 真实 Linux 只读扫描识别 10 个 Codex 进程，其中 8 个通过 tmux/布局关联为已管理；全部可读 cwd。两个外部进程未获得可靠会话证据，按预期不可接入。没有输出进程命令参数或环境变量。
- 未实际停止任何真实 Codex/Claude，不宣称真实对话迁入验收通过；恢复中的内存、进行中工具及滚屏不保证保留。
- 未执行 macOS 实机验证。macOS 参数来自系统进程输出，异常启动路径/包装器可能无法识别；无法可靠识别时不允许接入。
- 支持默认原生会话根；自定义根或不能可靠映射的会话不能自动迁入。
- 中途丢失 tmux 回应时，目标可能已启动；保存 dispatching 并要求检查目标，不盲目重启。目标被手动移除时保留记录并报告人工恢复要求。
