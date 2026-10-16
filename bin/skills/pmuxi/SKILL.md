---
name: pmuxi
description: 使用 purplemux-improved 的 pmuxi CLI 查询和操作工作区、标签、Agent 会话、输入队列、工作树及浏览器面板。用户要通过已安装的 CLI 控制 Purplemux、排查会话或完成工作树交付时使用。
---

# pmuxi CLI 操作

## 入口与连接

- 使用 `pmuxi` 操作已有服务。它无参数时显示帮助，任何情况下都不会启动服务。
- `purplemux-improved` 无参数或 `start` 会启动服务；仅在任务要求启动服务时使用，不能作为连接失败的自动修复。
- CLI 自动读取 `~/.purplemux/port` 与 `~/.purplemux/cli-token`，已有 `PMUX_PORT` / `PMUX_TOKEN` 优先。不需要手工读取或展示 token。
- 源码 checkout 中将 `pmuxi` 替换为 `node "bin/cli.js"`，并在仓库根目录执行，避免误用全局旧版本。

## 按需发现命令

先查看与任务相关的帮助，以实际安装版本为准：

```bash
pmuxi help
pmuxi features
pmuxi worktree --help
pmuxi worktree inspect-sync --help
pmuxi help commit create
```

这些命令和 `pmuxi skill` 离线可用。`pmuxi api-guide` 需要服务在线，用于 CLI 未覆盖的 HTTP 请求及响应结构查询。不要把命令组的 `--help`、`--data` 语法套用到所有旧 `tab` 子命令；它们的参数见 `pmuxi help`。

| 任务 | 查询入口 |
| --- | --- |
| 工作区和分组 | `pmuxi workspaces`、`pmuxi workspace --help`、`pmuxi group --help` |
| 标签状态与终端输出 | `pmuxi tab list -w WS`、`pmuxi tab status -w WS TAB_ID`、`pmuxi tab result -w WS TAB_ID` |
| 工作树创建、同步、清理及 PR/MR | `pmuxi worktree --help` |
| 检查变更、生成信息、创建提交 | `pmuxi commit --help` |
| 会话历史与当前状态 | `pmuxi session --help` |
| 输入队列、附件、立即回答 | `pmuxi queue --help`、`pmuxi upload --help` |
| 服务配置和 Codex 启动参数 | `pmuxi config --help`、`pmuxi codex --help` |

## 先定位目标，再执行操作

1. 运行 `pmuxi workspaces`，按用户指定目录或名称选定工作区；上下文已有明确工作区 ID 时可复用。
2. 运行 `pmuxi tab list -w WS` 确认标签、类型及当前会话。用返回的实际标识替换示例中的 `WS`、`TAB_ID`，不要猜测。
3. 对照任务和已有授权执行操作，然后读取状态或结果验证。`tab send` 成功仅表示输入已发送，不表示目标任务完成。

工作区 ID、标签 ID、tmux session 名称、Agent session ID 不可互换。例如 `commit inspect --session` 接收 tmux session，`session codex --cwd` 接收目录，`queue answer --agent-session-id` 必须绑定目标标签当前的 Agent 会话。需要更多字段时根据 `api-guide` 查询；不要拼接猜测标识。

向其他标签发送内容会驱动 shell 或 Agent 执行任务；仅在用户要求发送、委派或相应操作已被授权时使用 `tab send` / `queue add` / `queue submit` / `queue answer`。发送后查看 `tab status` 和 `tab result`；不要自行创建并行 Agent 作为普通查询的默认步骤。

## 参数与输出

命令组详细参数由当前 `--help` 给出。简单字段使用 kebab-case 标志，复杂请求使用文件：

```bash
pmuxi worktree inspect-sync -w WS --data "@item.json" --target-ref "refs/remotes/origin/main"
```

- 请求 JSON 字段用 camelCase；只包含该命令允许的字段，不传固定的 `action`。显式标志覆盖 `--data` 同名字段。
- 命令组中的布尔值必须写 `true` / `false`；对象和数组使用 JSON。路径加引号，复杂文本写进请求文件，避免 shell 展开。
- 普通结果为 JSON；帮助和 Skill 为文本，截图可输出 PNG，关闭标签可能输出 `ok`。不要假定所有输出都可直接解析为 JSON。
- 检查退出码及返回体。同步冲突、批量清理部分失败可能在非零退出时仍输出有用 JSON；保留逐项失败原因，不把部分成功报告为全部成功。

## 工作树与提交的快照约束

- 先运行 `worktree list -w WS`。`item` 为 `{repositoryId,directory,head,branch}`：`repositoryId` 来自 `repositories[].id`，其余来自选中的 `worktrees[]`。确认路径和分支，不从旧对话编造 `head`。
- 同步前运行 `inspect-sync`；`merge` / `rebase` 使用返回并审阅的 `targetHead`。`merge` 将 `targetRef` 合入 `item` 指定的工作树，`item` 是实际被修改的目录。
- `fetch`、提交或其他 Git 变更之后重新读取快照。快照过期或出现冲突时检查当前状态再决定下一步，不能自动强制覆盖或循环重试。
- `inspect-sync` 会将主工作树列为 blocker；同步操作中只有 `merge` 支持主工作树。主工作树的 `rebase` / `continue` / `abort` 仍受限，主工作树合并冲突应按用户授权通过 Git 处理。
- `commit inspect` / `commit generate` 返回提交快照；`commit create` 需要该快照及 `{title,body}` 信息。生成信息不等于已经提交；`generate-draft` 不等于已经发布 PR/MR。
- 推送和创建草稿支持主工作树，仍受发布检查约束；删除和清理继续保护主工作树。清理前使用 `preview-cleanup` 审阅 blockers 和忽略文件，不自动设置丢弃未合并分支、关闭会话或确认忽略路径等参数来绕过保护。

这些命令不授予额外权限。提交、推送、删除和配置变更应符合用户当前任务授权及所在环境规则。

## 会话、配置与浏览器的差异

- `workspace delete` 默认同时删除原始 Agent 会话；需要保留时显式使用 `--delete-sessions false`。`session delete` 的 `--delete-original true` 才会删除原始记录。两者默认行为不同。
- `queue add` 排队，`queue submit` 立即提交队列，`queue answer` 向当前 Agent 会话立即发送答案；会话切换后必须重新确认绑定，避免把答案发给旧会话。
- `config set --codex-environment` 替换完整环境变量映射；更新前读取并保留仍需保留的项。`config get` 和 `codex launch-args` 可能含敏感环境值，报告时省略这些值。
- `web-browser` 标签使用 Electron webview，`alive: false` 是正常值，不能据此断言浏览器不可用。使用 `tab browser url`、`screenshot`、`console`、`network` 和 `eval` 检查；终端标签才用 `alive` 判断 tmux 存活。
- `tab browser eval` 会执行页面 JavaScript，应按任务范围选择表达式。浏览器桥接返回 503 时确认是否运行支持该功能的 Electron 环境，不反复重试终端操作。

## 失败后的处理

缺少端口/token 或连接失败时，说明 CLI 未连接到已有服务，核对当前运行环境；不要启动另一个服务。未知命令或参数时读取本机帮助；旧版本没有某功能时明确版本能力限制。HTTP 错误和服务端 blockers 按实际返回解释，不通过删除配置、绕过检查或强制 Git 操作修复。

完成后报告操作目标、实际结果和验证方式，明确区分已发送、执行中、已完成与失败。
