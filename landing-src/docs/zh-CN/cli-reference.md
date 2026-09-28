---
title: CLI 参考
description: purplemux-improved 和 pmux 二进制的所有子命令与参数。
eyebrow: 参考
permalink: /zh-CN/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux-improved` 提供两种使用方式:作为服务启动器(`purplemux-improved` / `purplemux-improved start`)和作为与运行中服务对话的 HTTP API 包装器(`purplemux-improved <subcommand>`)。短别名 `pmux` 与之等价。

## 一个二进制,两种角色

| 形式 | 行为 |
|---|---|
| `purplemux-improved` | 启动服务。等价于 `purplemux-improved start`。 |
| `purplemux-improved <subcommand>` | 与运行中的服务的 CLI HTTP API 通信。 |
| `pmux ...` | `purplemux-improved ...` 的别名。 |

`bin/purplemux.js` 将已知子命令路由到 `bin/cli.js`；没有参数或使用 `start` 时启动服务，未知命令报错。

## 启动服务

```bash
purplemux-improved              # 默认
purplemux-improved start        # 同上,显式
PORT=9000 purplemux-improved    # 自定义端口
HOST=all purplemux-improved     # 全部绑定
```

完整环境变量见 [端口与环境变量](/purplemux-improved/zh-CN/docs/ports-env-vars/)。

服务会打印绑定的 URL、模式和认证状态:

```
  ⚡ purplemux-improved  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

如果 `8022` 已被占用,服务会发出警告并改绑随机空闲端口。

## 子命令

除 `help`、`features` 和命令的 `--help` 外，执行操作需要一个运行中的服务。它们从 `~/.purplemux/port` 读端口、从 `~/.purplemux/cli-token` 读认证 token,这两个文件都会在服务启动时自动写好。

| 命令 | 用途 |
|---|---|
| `purplemux-improved workspaces` | 列出工作区 |
| `purplemux-improved tab list [-w WS]` | 列出标签(可按工作区限定) |
| `purplemux-improved tab create -w WS [-n NAME] [-t TYPE]` | 创建新标签 |
| `purplemux-improved tab send -w WS TAB_ID CONTENT...` | 给标签发送输入 |
| `purplemux-improved tab status -w WS TAB_ID` | 查看标签状态 |
| `purplemux-improved tab result -w WS TAB_ID` | 抓取标签窗格当前内容 |
| `purplemux-improved tab close -w WS TAB_ID` | 关闭标签 |
| `purplemux-improved tab browser ...` | 驱动 `web-browser` 标签(仅 Electron) |
| `purplemux-improved api-guide` | 打印完整 HTTP API 参考 |
| `purplemux-improved help` | 显示用法 |

输出默认为 JSON。`--workspace` 和 `-w` 可互换。

### `tab create` 面板类型

`-t` / `--type` 选择面板类型。有效值:

| 值 | 面板 |
|---|---|
| `terminal` | 普通 shell |
| `claude-code` | 已经在跑 `claude` 的 shell |
| `web-browser` | 内嵌浏览器(仅 Electron) |
| `diff` | Git 差异面板 |

不带 `-t` 时,得到一个普通终端。

### `tab browser` 子命令

只有当标签的面板类型是 `web-browser`,且仅在 macOS Electron 应用中工作时可用 — 否则桥接返回 503。

| 子命令 | 返回内容 |
|---|---|
| `purplemux-improved tab browser url -w WS TAB_ID` | 当前 URL + 页面标题 |
| `purplemux-improved tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG。带 `-o` 保存到磁盘;不带则返回 base64。`--full` 整页截图。 |
| `purplemux-improved tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | 最近控制台条目(环形缓冲,500 条) |
| `purplemux-improved tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | 最近网络条目;`--request ID` 抓取一条响应体 |
| `purplemux-improved tab browser eval -w WS TAB_ID EXPR` | 执行 JS 表达式并序列化结果 |

## 示例

```bash
# 找到工作区
purplemux-improved workspaces

# 在 ws-MMKl07 工作区里创建一个 Claude 标签
purplemux-improved tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# 给它发提示(TAB_ID 来自 `tab list`)
purplemux-improved tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# 查看状态
purplemux-improved tab status -w ws-MMKl07 tb-abc

# 抓取窗格内容
purplemux-improved tab result -w ws-MMKl07 tb-abc

# 给一个 Web 浏览器标签整页截图
purplemux-improved tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## 认证

每个子命令都发送 `x-pmux-token: $(cat ~/.purplemux/cli-token)`,服务端用 `timingSafeEqual` 校验。`~/.purplemux/cli-token` 文件在首次服务启动时通过 `randomBytes(32)` 生成,以 `0600` 模式存放。

如果你需要从看不到 `~/.purplemux/` 的另一个 shell 或脚本驱动 CLI,改用环境变量:

| 变量 | 默认 | 作用 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 的内容 | CLI 通信的端口 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 的内容 | 作为 `x-pmux-token` 发送的 bearer token |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux-improved workspaces
```

{% call callout('warning') %}
CLI token 授予服务的完全访问权限。把它当作密码对待。不要粘到聊天里、提交进版本库,或暴露为构建环境变量。要轮换的话,删除 `~/.purplemux/cli-token` 并重启服务。
{% endcall %}

## update-notifier

`purplemux-improved` 在每次启动时检查 npm 上是否有更新版本(通过 `update-notifier`),并在有新版本时打印横幅。用 `NO_UPDATE_NOTIFIER=1` 或任意 [`update-notifier` 标准退出方式](https://github.com/yeoman/update-notifier#user-settings) 关闭。

## 完整 HTTP API

`purplemux-improved api-guide` 打印每个 `/api/cli/*` endpoint 的完整 HTTP API 参考,包括请求体和响应结构 — 当你想直接用 `curl` 或其他运行时驱动 purplemux-improved 时很有用。

## 下一步

- **[端口与环境变量](/purplemux-improved/zh-CN/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` 在更广环境变量中的位置。
- **[架构](/purplemux-improved/zh-CN/docs/architecture/)** — CLI 实际在跟谁通信。
- **[故障排查](/purplemux-improved/zh-CN/docs/troubleshooting/)** — 当 CLI 说 "服务在运行吗?" 的时候。

## Fork 新增能力

从源码验证本分支时，将下面的 `purplemux` 换成 `node bin/purplemux.js`，以免调用系统里安装的旧版本。`purplemux-improved`、`purplemux` 和 `pmux` 使用相同入口。

```bash
purplemux features                 # 离线查看全部 fork 命令及 HTTP 路径
purplemux worktree --help           # 查看整个命令组
purplemux worktree create --help    # 查看单条命令的必填/可选参数
purplemux help commit create        # 等价的帮助形式
```

帮助不需要启动服务。执行命令仍需本机运行的服务和 CLI token。普通输出为 JSON；参数错误、HTTP 错误、同步失败和批量清理部分失败均返回非零退出码；后两种保留完整 JSON，便于检查冲突和逐项结果。

| 命令组 | 子命令 | 用途 |
| --- | --- | --- |
| `workspace` | `list`, `directories`, `create`, `update`, `reorder`, `delete` | 浏览目录、注册工作区、改名/分组、排序、删除关联会话 |
| `group` | `create`, `update`, `reorder`, `delete` | 创建、改名、折叠、排序、解除分组；用 `workspace list` 读取分组 |
| `worktree` | `source`, `list`, `create`, `generate-branch`, `adopt`, `remove` | 查看基线分支、AI 命名、创建、接入及删除工作树 |
| `worktree` | `measure`, `preview-cleanup`, `cleanup` | 统计空间、预览阻塞项、批量清理 |
| `worktree` | `inspect-sync`, `fetch`, `merge`, `rebase`, `continue`, `abort` | 检查目标版本并同步；解决冲突后继续或中止 |
| `worktree` | `save-review`, `refresh-review`, `push`, `generate-draft`, `create-draft` | 关联 PR/MR、刷新状态、推送、生成描述、创建草稿 |
| `commit` | `inspect`, `generate`, `create` | 预览变更、生成提交信息、按快照提交 |
| `session` | `claude`, `codex`, `entries`, `claude-status`, `codex-status`, `delete` | 会话列表、历史事件/计划、实时状态栏、移除原始记录 |
| `queue` | `list`, `add`, `submit`, `answer`, `remove` | 排队输入、立即提交队列、直接回答当前会话问题 |
| `upload` | `file` | 上传附件并返回队列可使用的路径 |
| `config` | `get`, `set` | Codex 环境、AI 生成提示词、编辑器配置 |
| `codex` | `launch-args` | 检查启动参数和环境变量 |
| `tab` | `rename` | 重命名标签；空名称恢复自动标题 |

### 参数与请求文件

简单字段使用 kebab-case 参数，例如 `--target-ref` 对应 JSON 的 `targetRef`。`-w`、`--workspace`、`--workspace-id` 等价。布尔参数必须显式传 `true` 或 `false`，避免遗漏值改变删除行为。

复杂对象使用 JSON 参数或完整请求文件；请求文件的键名采用接口的 camelCase。显式参数覆盖文件中同名字段。未知字段/参数会在发送请求前报错。

```bash
purplemux worktree create -w ws-EXAMPLE --name "修复登录" --branch "fix/login" --base-ref "main"
purplemux worktree create --data @request.json
cat "request.json" | purplemux worktree create --data -
```

`--data` 仅包含该命令帮助列出的字段，不传 `action`。命令自身决定固定 action。GET 的字段进入查询字符串；其他命令通常进入 JSON body；`queue` 的 `workspaceId`、`tabId` 始终进入查询字符串；路径中的 `:workspaceId` / `:groupId` 由相应参数替换。上传使用二进制请求体。

### 工作区、分组和标签

```bash
purplemux workspace directories --directory "/home/me/projects"
purplemux workspace create --directory "/home/me/projects/app" --name "App"
purplemux workspace list
purplemux workspace update -w ws-EXAMPLE --name "新名称"
purplemux group create --name "本周需求"
purplemux workspace update -w ws-EXAMPLE --group-id "GROUP_ID"
purplemux group update --group-id "GROUP_ID" --collapsed true
purplemux workspace reorder --items '[{"id":"ws-EXAMPLE","groupId":null}]'
purplemux group reorder --group-ids '["GROUP_ID"]'
purplemux tab rename -w ws-EXAMPLE TAB_ID "代码检查"
purplemux tab rename -w ws-EXAMPLE TAB_ID ""

# 保留原始会话记录；省略 --delete-sessions 时服务端默认删除记录
purplemux workspace delete -w ws-EXAMPLE --delete-sessions false
```

排序请求按服务端规则提供完整的目标顺序。删除工作区不会自动删除磁盘工作树和分支；磁盘清理由 `worktree remove` / `cleanup` 完成。

### 工作树创建、同步与交付

```bash
purplemux worktree source -w ws-EXAMPLE --directory-index 0
purplemux worktree generate-branch -w ws-EXAMPLE --title "修复登录" --base-ref "main"
purplemux worktree create -w ws-EXAMPLE --name "修复登录" --branch "fix/login" --base-ref "main"
purplemux worktree list -w ws-EXAMPLE > "worktrees.json"
```

分支名生成使用已有的无工具 Claude 能力；只返回建议名称，不创建分支。多目录工作区通过 `--directory-index` 选择仓库。

管理和交付操作必须指定准确工作树。下面用 `jq` 从列表构造 `item.json`；先把 `WT_DIR` 改为目标目录，并检查生成的内容。`repositoryId` 来自 `repositories[].id`，其余字段来自选中的 `worktrees[]`，不要猜测或省略 `head`。

```bash
WT_DIR="/absolute/path/to/worktree"
jq --arg dir "$WT_DIR" '{item: ([.repositories[] | .id as $repo | .worktrees[] | select(.directory == $dir) | {repositoryId:$repo,directory,head,branch}] | if length == 1 then .[0] else error("select exactly one worktree") end)}' "worktrees.json" > "item.json"
cat "item.json"
purplemux worktree measure -w ws-EXAMPLE --data @item.json
purplemux worktree inspect-sync -w ws-EXAMPLE --data @item.json --target-ref "refs/remotes/origin/main" > "sync.json"

# 审阅 sync.json 后，将目标快照加入请求；merge/rebase 都要求 targetHead
jq --slurpfile sync "sync.json" '. + {targetRef:$sync[0].targetRef,targetHead:$sync[0].targetHead}' "item.json" > "merge.json"
purplemux worktree merge -w ws-EXAMPLE --data @merge.json
```

需要最新远端状态时先执行 `worktree fetch -w ws-EXAMPLE --data @item.json`，再执行 `inspect-sync`。同步修改了 HEAD 或出现冲突后，重新读取列表和快照，再使用 `continue` / `abort`。服务端保留脏文件、会话占用、忽略文件冲突及目标版本变化检查，不会在 CLI 中自动刷新并绕过确认。

```bash
# 以下操作使用重新检查过的 item.json
purplemux worktree push -w ws-EXAMPLE --data @item.json --remote origin
purplemux worktree generate-draft -w ws-EXAMPLE --data @item.json --remote origin --target-branch main --locale zh-CN > "draft.json"

# 审阅 title/body 后创建草稿；GitLab 改用 --provider gitlab
jq --slurpfile draft "draft.json" '. + {title:$draft[0].title,body:$draft[0].body}' "item.json" > "review.json"
purplemux worktree create-draft -w ws-EXAMPLE --data @review.json --remote origin --target-branch main --provider github
purplemux worktree refresh-review -w ws-EXAMPLE --data @item.json
```

创建草稿/刷新状态沿用服务器上的 Git 和 GitHub/GitLab CLI 认证。`generate-draft` 只生成文案；`push` 和 `create-draft` 会执行真实远端操作。已有 PR/MR 可用 `save-review --url "https://..."` 关联，`--url null` 解除关联。

清理时，先将目标快照放入 `items` 数组，执行 `preview-cleanup` 检查 `blockers` 和 `ignoredPaths`，再用同一组已审阅快照执行 `cleanup`。需要删除忽略文件时，在相应快照中显式填写 `confirmedIgnoredPaths`。单个工作树的 `remove` 使用扁平字段 `{repositoryId,directory,head,branch,...}`，不是 `{item:...}`；`deleteBranch` 默认 `false`。

```bash
jq '{items:[.item]}' "item.json" > "cleanup.json"
purplemux worktree preview-cleanup -w ws-EXAMPLE --data @cleanup.json
purplemux worktree cleanup -w ws-EXAMPLE --data @cleanup.json
```

### AI 提交信息与提交

`--session` 是 `tab list` 返回的 tmux `sessionName`，不是标签 ID 或 Agent 会话 ID。

```bash
purplemux tab list -w ws-EXAMPLE
purplemux commit inspect --session "TMUX_SESSION"
purplemux commit generate --session "TMUX_SESSION" --locale zh-CN > "commit-preview.json"

# 审阅文件列表和 title/body；仅提取提交所需字段
jq '{snapshot,message:{title,body}}' "commit-preview.json" > "commit.json"
purplemux commit create --session "TMUX_SESSION" --data @commit.json
```

`generate` 不提交；`create` 检查分支、HEAD 和变更树快照后提交。若文件变化导致快照失效，重新检查并生成请求。

### 输入队列、附件与会话

```bash
purplemux queue add -w ws-EXAMPLE --tab-id TAB_ID --id msg-1 --text "完成后再补充测试"
purplemux queue list -w ws-EXAMPLE --tab-id TAB_ID
purplemux queue submit -w ws-EXAMPLE --tab-id TAB_ID
purplemux queue remove -w ws-EXAMPLE --tab-id TAB_ID --id msg-1

purplemux upload file --file "./design.pdf" -w ws-EXAMPLE --tab-id TAB_ID > "attachment.json"
jq '{attachments:[.],text:"请检查附件"}' "attachment.json" > "message.json"
purplemux queue add -w ws-EXAMPLE --tab-id TAB_ID --id msg-2 --data @message.json

purplemux tab status -w ws-EXAMPLE TAB_ID
purplemux queue answer -w ws-EXAMPLE --tab-id TAB_ID --id answer-1 --agent-session-id AGENT_SESSION_ID --text "选择第一项"
purplemux session codex-status -w ws-EXAMPLE --tab-id TAB_ID --session-id AGENT_SESSION_ID
purplemux session codex --cwd "/absolute/path/to/repo" --days-back 30
purplemux session claude --tmux-session "TMUX_SESSION" --limit 20
purplemux session entries --jsonl-path "/allowed/session.jsonl" --before-byte 4096 --mode turn

# 默认仅移除历史/隐藏；显式 true 同时删除原始记录
purplemux session delete --provider codex --session-id AGENT_SESSION_ID --delete-original true
```

上传文件非空且最大 50 MiB。队列允许纯文本、纯附件或两者组合。`queue answer` 的 Agent 会话 ID 必须与当前状态一致，会话切换时服务端拒绝发送。状态栏响应的 `active:false` 表示未匹配当前活动会话。历史读取的 `beforeByte` 为字节游标，路径必须通过服务端会话目录校验。

### Codex 环境与生成提示词

```bash
purplemux config get
purplemux config set --codex-environment '{"EXAMPLE_VARIABLE":"value"}'
purplemux codex launch-args -w ws-EXAMPLE
purplemux config set --branch-name-provider claude
purplemux config set --data @prompts.json
```

`codexEnvironment` 替换整张配置映射，仅影响后续启动的进程。`prompts.json` 可包含 `branchNamePrompt`、`commitMessagePrompt`、`reviewDescriptionPrompt`；变量和长度沿用服务端校验。`config get` 与 `codex launch-args` 会返回所配置的环境变量值。

### 仅在界面内生效的改进

子工作区自动隐藏、触摸拖拽、移动端布局、消息展开、浏览器本地缓存清理、原生 `/` 菜单的展示与终端流控属于界面或运行时行为，没有伪装成服务器 CLI 操作。Todo/Plan 可通过 `session entries` 读取原始事件，展示仍由界面完成。
