# 实施记录

日期：2026-10-16。先补齐本需求规格，再实现。

- `src/components/features/workspace/terminal-commands-bar.tsx`：共用命令栏与管理弹窗，支持命名、新增、编辑、删除确认、输入校验、保存失败保留草稿、读取重试；只在点击且连接有效时发送命令。
- `pane-container.tsx`、`mobile-surface-view.tsx`：接入普通 Terminal，桌面不依赖虚拟按键栏显示设置，移动端与既有输入框/固定按键共存。
- `src/lib/terminal-custom-commands.ts`：共享 Zod 校验、数量限制、终端换行处理。参考 VS Code `terminalInstance.ts` 的 `sendText`：LF/CRLF 转 CR，末尾已有 CR 时不重复添加。
- `src/lib/workspace-store.ts`、`src/types/terminal.ts`：在 `workspaces.json` 增加可选 `terminalCommands`，复用全局文件锁、原子写入和内容缓存。单条 CRUD 避免覆盖并发修改；命令 API 严格读取配置，拒绝把磁盘读取失败/损坏当成空数据后覆盖。
- `src/pages/api/terminal-commands.ts`：GET 列表、POST 新增、PATCH 编辑、DELETE 删除；400 校验失败、404 ID 不存在、409 数量已满、500 存储异常；沿用已有身份验证代理。
- `src/hooks/use-terminal-commands.ts`、`use-sync.ts`：SWR 共享、保存成功再更新、工作区广播/同步重连及聚焦刷新。
- `messages/*/terminal.json`：补齐所有语言目录的键，提供简中、繁中、英文文案；其余语言暂使用英文文案，与既有终端文案回退方式一致。
- `package.json`、`pnpm-lock.yaml`：按项目表单约定加入 `react-hook-form` 与 `@hookform/resolvers`，保留既有依赖解析结果，仅增加这两个包相关锁定项；`pnpm install --frozen-lockfile` 已通过。

## 原则应用

- KISS / YAGNI：限定普通终端的命名快捷命令，不加入模板变量、定时执行、排序、快捷键绑定或独立 shell。
- DRY：桌面/移动共用界面，客户端/API 共用校验，持久化复用工作区锁与广播。
- 单一职责：命令模型、API、数据 Hook、交互组件分别负责校验/传输/缓存/界面；执行仍由已有终端输入通道承担。

未提交、推送或发布。验证结果见 [verify.md](./verify.md)。

## Review 修正：copy-mode 下执行命令

- 问题：原先两个接入点传入 `sendStdin`，命令直接写入 PTY，可能被 tmux copy-mode 消费。
- 修改：`pane-container.tsx` 和 `mobile-surface-view.tsx` 的 `TerminalCommandsBar` 均改传已有的 `sendWebStdin`；服务端沿用 `MSG_WEB_STDIN → exitCopyMode → PTY.write` 顺序。
- KISS / DRY：只修正两处输入通道接入，复用现有协议及服务端队列，不新增退出复制模式逻辑；原生终端按键、固定键栏及断线禁用条件保持原行为。
- 新增两项回归测试：客户端网页输入帧与断线不补发；服务端等待复制模式退出后写入、连续命令顺序。

## PR #50 修正：Unicode C1 控制字符（2026-10-17）

- 对应[审查意见](https://github.com/stirp/purplemux-improved/pull/50#discussion_r4297384920)：原正则只拒绝 C0 和 DEL，遗漏 U+0080–U+009F。
- `terminalCommandSchema` 将 DEL 单字符扩展为 U+007F–U+009F 范围，补齐全部 Unicode `Cc` 控制字符；仍仅放行 TAB/LF/CR。客户端与 API 继续复用同一校验，KISS/DRY，无需修改执行、持久化或协议。
- API 回归逐个验证 62 个禁止字符，在 POST/PATCH 均返回 400 且不进入存储；正向用例确认 TAB/LF/CR、中文、重音字符、emoji 及 U+00A0 原样保留。
- UI 回归确认粘贴 U+009B 后显示错误、保留草稿且没有写请求，修正为合法 Unicode 命令后可保存。
