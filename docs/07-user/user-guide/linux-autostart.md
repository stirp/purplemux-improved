# Linux 开机自启动

支持两种方式，可分别配置：后台服务在开机后运行，桌面窗口在登录图形桌面后打开。默认均不启用。

## 后台服务

需要 Linux systemd 用户服务、Node.js 24+、tmux，以及安装在固定位置的 purplemux-improved。临时 npx 缓存或会被删除的开发 worktree 不适合作为长期启动路径。

```bash
# 开机启动后台服务，包括尚未登录的时候
purplemux-improved autostart enable --boot

# 查询实际状态
purplemux-improved autostart status

# 取消后续自动启动
purplemux-improved autostart disable
```

`--boot` 显式为当前用户执行 `loginctl enable-linger`，系统可能要求授权。命令不会自动 sudo；权限不足时报告失败。缺少 `--boot` 的 `enable` 仅注册登录启动；如果当前用户已经开启 linger，也具备开机启动能力。

linger 是用户级设置；开启后即使后续 unit 写入或注册失败，也不会自动撤销。可查询 status 确认服务与 linger 的各自状态。

状态字段：

| 字段 | 含义 |
| --- | --- |
| `enabled` | systemd 已持久启用该用户服务 |
| `active` | 服务当前处于 active 状态 |
| `linger` | 当前用户是否开启 linger；无法查询时为 null |
| `bootEnabled` | 服务已启用且确认 linger 开启，具备未登录开机启动条件 |
| `path` | 生成的 unit 文件路径 |

只有 `bootEnabled: true` 才表示已确认未登录开机启动条件。加密主目录需要先登录才能解锁、系统未启用 systemd/logind、机器断电等限制不由本工具消除。

注册或停用不会立即启动、停止或重启正在运行的服务器；新配置在下次登录或开机生效。需要立即改由 systemd 托管时，先自行结束现有手动启动的服务器，再运行 `systemctl --user start purplemux-improved.service`，避免启动两个服务器。

unit 位于 `${XDG_CONFIG_HOME:-~/.config}/systemd/user/purplemux-improved.service`，使用固定 Node/服务入口路径、当前 PATH 和 PORT（默认 8022），工作目录为用户主目录。不会复制当前 shell 的令牌、代理或其他环境变量。额外环境可使用 `systemctl --user edit purplemux-improved.service` 配置；网络访问及认证继续遵循应用自身设置。

移动应用、升级到不同 Node 路径或改变端口后，重新执行 enable 更新启动配置。例如：

```bash
PORT=8123 purplemux-improved autostart enable --boot
journalctl --user -u purplemux-improved.service
```

disable 保留 unit 文件，也保留当前用户的 linger，避免影响其他用户服务。若不再需要任何服务在未登录时启动，可自行执行 `loginctl disable-linger`。

`pmuxi` 仍只操作运行中的服务，不接受 autostart 命令。源码开发可在 `pnpm build` 后使用 `node "bin/purplemux.js" autostart …`，但长期配置应指向稳定安装。

## 桌面客户端

Linux 桌面应用的 **设置 → 系统 → 登录后打开桌面应用** 控制图形桌面登录启动。开启后生成当前用户的 XDG autostart 文件；关闭后移除该启动项。普通网页中不显示此开关。

请把 AppImage 移到固定位置后开启，启动项会指向 AppImage 原文件，而非运行时临时挂载目录。移动后重新开启开关可更新路径。开发模式及临时目录中的应用不能注册启动项；读取失败可以重试，保存失败会提示。

自启动依赖桌面环境支持 XDG autostart。开机但未登录图形桌面时不会显示窗口；此时应由上面的 systemd 后台服务提供访问能力。桌面客户端会连接已有健康后台服务，退出客户端不会停止该独立服务。

通过 GNOME 启动应用管理器关闭启动项后，应用会识别其禁用标记；重新打开设置或聚焦刷新时显示关闭状态。

复用后台服务时，浏览器标签的 CLI 控制通过本机私有通道连接桌面应用。桌面退出或切换到远程服务器后，后台服务仍运行，但本机浏览器控制接口返回不可用；重新打开本地桌面和浏览器标签后恢复。

Linux 构建入口：

```bash
pnpm pack:electron:linux
```

本功能新增 AppImage 构建配置，不代表已发布 Linux 安装包。实际发布文件以 Releases 为准。

## 验证范围

自动化覆盖见[需求验证记录](../../../.specs/v22/changes/configurable-auto-start-on-boot/result/verify.md)。systemd 解析检查、模拟 IPC 浏览器检查与真实开机验收是不同层级，不能相互替代。
