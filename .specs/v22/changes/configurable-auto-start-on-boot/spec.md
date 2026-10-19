---
page: configurable-auto-start-on-boot
title: Linux 可配置开机自启动
status: DETAILED
created: 2026-10-19
updated: 2026-10-20
depends_on:
  - ../../../v20/features/fork-platform/spec.md
  - ../pmuxi-cli-only/spec.md
---

# Linux 可配置开机自启动

## 用户原始需求

“能否支持开机自启动？”；明确“linux 版本能够开机自动启动”，桌面客户端与命令行后台服务“两种都支持”。

## 范围与行为

- 新增 Linux 启动支持，保留 macOS LaunchAgent 行为、现有服务启动入口及配置。默认不注册启动项，不迁移旧配置。
- 后台服务提供 `purplemux-improved autostart enable [--boot]`、`disable`、`status`、`--help`。仅服务入口接受该命令；`pmuxi` 继续禁止启动/管理服务启动项。
- 使用当前用户的 `purplemux-improved.service`，写入 XDG 配置目录的 `systemd/user/`。固定当前 Node 和已安装服务入口的绝对路径，工作目录为用户目录；显式保存 PATH 和当前有效 PORT（默认 8022），不复制令牌或整个 shell 环境。路径支持空格、引号、反斜杠、百分号、美元符号；拒绝控制字符和无效端口。
- `enable` 注册登录启动；`enable --boot` 额外显式调用 `loginctl enable-linger` 为当前用户启用无人登录的开机启动，不自动 sudo。检查用户 manager 可用性，失败返回非零并提示原因；成功后查询真实启用状态。status 返回 enabled、active、bootEnabled、linger 和启动项路径，不以文件存在推定已生效。
- 注册/停用只影响后续启动，不立即启动、停止或重启正在运行的服务，以免打断会话。disable 保留 unit 文件并取消启用，幂等；不关闭用户级 linger，以免影响其他服务。失败不能显示成功；更新已有 unit 失败恢复原文件。
- Linux 桌面设置 → 系统新增“登录后打开桌面应用”开关，使用 XDG `autostart/purplemux-improved.desktop`；仅稳定路径的正式打包应用可启用，AppImage 使用 APPIMAGE 原文件路径，禁止临时挂载路径及开发版注册。提供 Linux AppImage 构建入口，不承诺本次发布安装包。
- 桌面设置读取系统启动项作为事实来源，支持关闭后重新读取、窗口聚焦刷新、加载失败重试、保存失败提示且保持原状态；保存时禁止重复操作。网页与其他平台不显示 Linux 桌面开关。远程网页及嵌入页面不可修改本机启动项。
- 桌面与后台分别配置；桌面启动优先复用已经健康的本地服务。后台已在启动时等待其就绪，避免两个配置并用时桌面立即另启服务；桌面重复打开使用 Electron 单实例锁。
- 审查修正：复用独立后台服务时，浏览器 URL、截图、脚本执行、控制台、网络日志及响应体接口通过当前用户私有 Unix socket 转发到 Electron；同进程桥接继续优先使用。沿用 API 的 token、工作区和标签类型校验，不开放 TCP 控制端口，不提供任意方法调用。退出桌面或切换远程服务器时关闭通道；断开与超时明确返回不可用，后续请求可连接重启后的桌面。
- 审查修正：读取 desktop 文件仅以 `[Desktop Entry]` 段为准，`Hidden=true` 或 `X-GNOME-Autostart-enabled=false` 任一出现即为禁用；注释和其他段不影响状态。重新启用会清除禁用标记，刷新后状态与实际启动配置一致。
- 合并兼容：与[自动更新](../auto-upgrade-detection/spec.md)同时保留各自设置词条和入口；桌面因安装更新退出时同样关闭本地浏览器桥接，继续执行已有服务和存储清理。
- PR #70 修正：systemd unit 使用 `KillMode=control-group`，监督器异常退出后清理同一服务控制组中的子进程，再执行失败重启，避免遗留服务器占用端口。启用/停用启动项仍不启停当前服务；显式停止 systemd 服务或监督器崩溃时，同组 tmux/任务也可能被清理，不再承诺跨服务停止保留这些子进程。监督器内的一键升级仍沿用现有保留 tmux 的行为。已有安装通过重新执行 enable 更新 unit。
- PR #70 修正：Linux 桌面开关仅在主进程确认本地服务模式、应用窗口及合法顶层来源后显示；远程模式（包括远程地址恰为 localhost）、嵌入页面、旧 preload 和能力查询失败时隐藏，不读取或修改启动项。聚焦时可重新查询；本机状态读取失败仍显示既有重试入口。
- 系统启动项是机器本地集成状态，不作为可同步应用偏好写入 workspaces.json，不将设置同步到其他电脑。原有网络访问、认证和工作区持久化语义不变。
- 本次开发和验证不修改宿主机启动设置，不执行登录重启或 Git 提交/发布。以临时目录和模拟系统命令验证写入、失败及边界，真实开机验收单独记录。

## 验收标准

1. CLI 帮助/状态不启动服务，无 systemd/用户总线、无 linger 权限、无构建产物、非法参数时明确失败；pmuxi 行为不变。
2. enable/disable/status 与 `--boot` 的状态一致，重复操作安全；更新失败恢复文件，状态区分登录启动、未登录开机启动和当前运行状态。
3. 生成的 unit 使用绝对路径并正确转义，PATH、PORT 可用，不包含敏感环境；systemd 解析验证通过。启停不影响当前运行服务。
4. 桌面启动项可读写、关闭和重新开启；支持 AppImage、XDG 配置路径及特殊路径，旧默认关闭，非 Linux/开发版/临时路径不可启用。
5. 桌面开关具备加载、重试、保存、失败和刷新行为，只有本机主窗口能调用 IPC；已有 macOS 开关及普通浏览器回归保持兼容。
6. 桌面复用已有后台服务、重复启动退出；相关测试、完整 TypeScript（含 Electron）、改动文件 ESLint、CLI 及 Electron 构建检查通过。浏览器和 Linux 实机开机的实际覆盖与限制如实记录。
7. 使用独立进程回归浏览器 API 的跨进程 URL、截图、eval、控制台、网络与响应体；覆盖未连接、断开、超时、重连及授权拒绝。验证 Unix socket 权限和方法白名单，不能仅用同进程 globalThis 替身证明跨进程可用。
8. GNOME 禁用标记、Hidden 标记、CRLF/空格、注释/其他段、重新启用均有临时文件回归测试。
9. 生成和重新注册的 unit 覆盖监督器子进程清理；远程模式不显示开关、不调用启动项读写 IPC，恢复本地模式后可读取状态。能力查询等待/失败和本机读取失败有独立回归。

见 [任务](./task.md) 与 [用户手册](../../../../docs/07-user/user-guide/linux-autostart.md)。
