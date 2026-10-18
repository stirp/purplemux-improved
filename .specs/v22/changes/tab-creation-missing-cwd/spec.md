---
page: tab-creation-missing-cwd
title: 新建标签页兼容失效工作目录
status: DETAILED
depends_on:
  - ../../../v2/features/tmux-backend/spec.md
  - ../../../v4/features/layout-api/spec.md
  - ../storage-consistency-repair/spec.md
---

# 新建标签页兼容失效工作目录

## 原始需求

排查并修复无法新建标签页：`POST /api/layout/pane/pane-ELHkEw/tabs?workspace=ws-g1UrCn` 返回 500，日志为 `tab creation failed: spawn tmux ENOENT`。

后续需求：新建有效 Git worktree 后，Terminal 仍出现 fish `std::env::current_dir() failed`。修复 tmux 3.7c 后台进程原 cwd 被删除时，新终端继承失效目录的问题。

## 原因与范围

本机 `/usr/bin/tmux` 可运行；目标工作区保存的 cwd 指向已删除的 worktree，且包含 Linux `/proc/<pid>/cwd` 的 ` (deleted)` 后缀。`execFile` 使用不存在的 cwd 时也会报 `spawn tmux ENOENT`。新建标签未使用重启标签已有的目录回退机制。

本增量补充布局 API 基线的标签创建行为：

- 非浏览器标签创建前复用 `resolveExistingDir`：有效 cwd 不变，失效路径沿父目录寻找可用目录，未提供 cwd 沿用 HOME/default 行为。
- 显式 cwd 发生回退时，返回及保存实际目录，记录原目录和回退目录；不得自动执行传入的 command、恢复历史会话或标记 agent 已启动，与重启标签的目录丢失保护一致。
- 客户端新建标签的启动等待状态由 `useLayoutStore.createTabInPane` 统一判断；桌面端和移动端调用方只补充标签元信息，不覆盖 hook 的判断。cwd 回退后保持默认会话列表状态，有效目录的 command/resume 仍进入 `check`。
- 浏览器标签不检查本地目录、不创建 tmux；有效目录的命令启动、会话恢复及响应结构保持兼容。
- tmux 真正启动失败仍返回失败，不写入新 Tab；不存在的 pane 仍返回 404。保存失败沿用原错误路径。
- 所有 `createSession` 入口从稳定的 `/` 启动 tmux 客户端/新后台进程，并显式传递目标目录。兼容现存后台进程 cwd 已删除的情形：Linux 直接执行 `/usr/bin/env -C`，在任何 shell 初始化前切换目录，避免引导 shell 的 getcwd 警告；其他平台用 POSIX shell 在用户登录 shell 启动前切换目录。不通过 tmux 缓存的默认 shell 解释引导命令。切换失败不得继续在错误目录启动用户 shell。保留登录 shell、隔离环境及 TMUX/TMUX_PANE 语义，目录按独立参数传递，支持空格、单引号及 shell 元字符。
- 不恢复或删除 worktree，不改 Git 分支，不批量修复工作区历史目录；现有重连、桌面/移动端共同调用的接口不变。
- 路径兼容：`createSession` 在校验和启动前按应用当前目录将相对 cwd 转为绝对路径，避免 tmux 客户端改从 `/` 启动后改变解析基准。传给 tmux 的所有目标目录参数均处理其末尾分号的命令分隔符语义；转义仅用于 tmux 参数，文件系统校验仍使用原始绝对路径，不能丢失目录名中的反斜杠或分号。不因启动路径绝对化改变已有 Tab/工作区的持久化格式。

## 验收

1. 原日志中的失效 cwd 可复现 Node ENOENT；复用目录解析后可成功创建标签，并将实际目录持久化。
2. 有效目录、未指定 cwd、嵌套缺失目录、含 ` (deleted)` 的路径均覆盖；不剥离合法同名目录的后缀。
3. cwd 回退后不发送 command/resume、不绑定恢复会话、不标记启动；有效 cwd 保持原命令和恢复流程。
4. 浏览器标签不调用 tmux；缺失 pane 不创建标签；tmux 启动失败不写入标签。
5. 运行相关回归、完整 TypeScript、改动文件 ESLint；记录真实子进程验证及未执行的浏览器/构建验证。
6. 回归覆盖桌面 `PaneContainer` 和移动 `MobileTerminalPage` 的真实创建回调及布局、标签 store：Claude/Codex 的 command/resume 在目录回退后均不进入 `check`，有效目录仍进入 `check`，标签插入、激活和工作区元信息保持正常。
7. 使用隔离 socket 的真实 tmux 复现后台 cwd 被删除，再通过真实 `createSession` 创建终端；实际 shell cwd 必须为目标目录，fish 不再报 current_dir 错误。验证普通目录、含特殊字符目录和 HOME 默认值；新 tmux 后台进程自身 cwd 保持 `/`，不依赖 worktree 的存续。不得重启或关闭用户已有会话。
8. 真实 tmux 回归覆盖末尾分号、多个末尾分号、反斜杠紧邻末尾分号及有效相对目录（包含末尾分号）；创建后 shell 保持运行且实际 cwd 与目标一致。
