# 实施记录

依据：[规格](../spec.md)。本次先补齐增量规格再实施，不改版本汇总或既有 macOS LaunchAgent 约定。

## 变更入口

- `bin/autostart.js`：systemd 用户服务的启用、停用、状态查询；`--boot` 显式设置 linger，失败返回非零。unit 使用 `%h` 工作目录、绝对 Node/服务入口、PATH/PORT 白名单和 `ExecStart=:/usr/bin/env -- …`，避免 systemd 的路径解析及变量展开问题。更新失败恢复原 unit 文件。保留 tmux 子进程，禁用启动项不停止现有服务。
- `bin/purplemux.js` 分发 autostart；`bin/cli.js` 只增加发现提示，pmuxi 不接管该命令。保持现有启动/HTTP CLI 分工，新增文件随既有 bin 包白名单分发。
- `electron/linux-autostart.ts`：XDG desktop 文件读写、AppImage 稳定路径检查、当前主窗口来源校验和后台服务启动等待逻辑。
- `electron/main.ts`、`preload.ts`：IPC 注册、Linux 后台复用与失败提示；真正处理单实例锁失败。切回本地服务也复用后台服务。顺带修正完整 Electron 类型检查暴露的已有 API 用法：可选 `app.dock` 和返回 void 的 `flushStorageData`。
- `linux-startup-settings.tsx` 与设置弹窗：仅 Linux 桌面显示开关；读写失败、重试、禁用态和聚焦刷新；11 种语言资源。
- `electron-builder.yml`、package scripts、`scripts/after-pack.js`：AppImage 构建入口及 Linux resources 路径，保留 macOS helper 复制逻辑。
- 中英文 README 与[用户手册](../../../../../docs/07-user/user-guide/linux-autostart.md)：区分图形登录与无人登录开机启动、状态解释、稳定安装路径与排障命令。

## 工程原则

- KISS/YAGNI：复用系统已有 systemd/XDG 能力，不引入驻留守护进程或新的依赖；不自动启动、重启当前服务器。
- DRY/SRP：操作系统集成独立于 CLI 分发、Electron IPC 与 React 界面；桌面复用健康检查，不另实现进程扫描。
- 兼容：系统启动项是本机状态，不添加可同步的 workspaces.json 偏好，不更改 macOS 自启动入口或 pmuxi 的禁止启动约定。

未修改宿主机自启动配置、未提交、推送或发布。检查结果见[验证记录](./verify.md)。

## 审查修正

- P2 浏览器控制桥接：新增 `src/lib/browser-bridge-rpc.ts`，通过权限为 0600 的 Unix socket 连接独立后台 API 和 Electron；父目录 0700，不监听 TCP。共享接口允许同步本地实现和异步远端实现，API 对 URL/标题、控制台和网络读取统一 await；保留原 token、工作区、标签类型校验，断开/超时返回 503，页面执行错误仍为 409。
- Electron 在 Linux 本地连接建立后启动通道，切换远端或退出时关闭。启动时探测已有 socket，仅回收拒绝连接的遗留 socket，不覆盖活跃通道或普通文件。每次 API 请求建立独立连接，使桌面重启后可以恢复。
- `electron/tsconfig.json` 允许通过项目别名复用 RPC 模块，避免 Electron/API 各维护一套协议；`initBrowserBridge` 返回原有实例，浏览器注册及 CDP 实现保持复用。
- P2 GNOME 状态误报：仅解析 `[Desktop Entry]` 段中的两类禁用标记；评论、其他段及无主段文件不误判启用。重新启用仍复用原子写入并清除旧禁用标记。
- 新增独立进程桥接夹具与 API 回归；补充 desktop 文件标记回归。数据目录文档和用户手册同步说明通道生命周期与 GNOME 禁用行为。
