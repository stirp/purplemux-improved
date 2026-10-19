# 验证记录

日期：2026-10-19。依据：[规格](../spec.md)。

## 自动化检查

| 检查 | 本次结果 |
| --- | --- |
| `pnpm test:cli` | 144 项通过，含 11 项新增 autostart 测试；pmuxi 和原服务入口回归通过 |
| `pnpm vitest run tests/unit/lib/linux-autostart.test.ts tests/unit/lib/linux-startup-settings.test.ts` | 21 项通过：文件写入/关闭、稳定路径、AppImage、IPC 来源、服务复用/等待/超时及真实组件读写/重试/刷新 |
| `systemd-analyze --user verify` | 临时 unit 实际解析通过，含空格、百分号、美元、引号、反斜杠路径；已纳入 CLI 测试，无服务注册 |
| `desktop-file-validate` | 特殊路径生成的 desktop 文件通过；已纳入单测 |
| `pnpm tsc --noEmit` | 完整应用类型检查通过 |
| `pnpm tsc --noEmit -p electron/tsconfig.json` | Electron 类型检查通过，最后一次检查退出码 0 |
| 改动文件 ESLint | 通过；默认忽略的 bin/electron/scripts 使用 `--no-ignore`，CJS 入口按既有 CommonJS 规范关闭 no-require-imports；无错误或警告 |
| `pnpm build:electron` | Next.js 页面构建、standalone 后处理、服务端及 Electron 主进程构建全部通过 |
| `pnpm build:electron:main` | 后续后台复用错误处理变更后再次构建通过 |
| `pnpm exec electron-builder --linux AppImage --publish never` | 退出码 0，生成 Linux x64 `release/purplemux-improved-0.5.6.AppImage`（约 176 MiB）；未发布 |
| afterPack Linux/macOS 临时目录夹具 | 均通过；Linux 清理 unpacked 断链，macOS 保留 helper 复制 |
| 11 种语言 JSON、键集合 | 均合法且与英文 key 集合一致 |
| `git diff --check` | 通过 |
| 本需求 Markdown 相对链接检查 | 5 个 Markdown 文件中的链接均可解析 |

ESLint 命令：

```bash
pnpm exec eslint "src/components/features/settings/linux-startup-settings.tsx" "src/components/features/workspace/settings-dialog.tsx" "tests/unit/lib/linux-autostart.test.ts" "tests/unit/lib/linux-startup-settings.test.ts" "tests/cli/autostart.test.cjs"
pnpm exec eslint --no-ignore --report-unused-disable-directives-severity off --rule "@typescript-eslint/no-require-imports: off" "bin/autostart.js" "bin/purplemux.js" "bin/cli.js" "scripts/after-pack.js" "electron/linux-autostart.ts" "electron/main.ts" "electron/preload.ts"
```

## 浏览器验证

使用 agent-browser 独立命名会话，挂载真实 LinuxStartupSettings、真实 UI 组件和构建 CSS，Electron IPC 使用内存替身；未启动连接真实用户数据的服务。

- 中文桌面与 320px 窄屏无横向溢出，开关有可访问名称；[桌面截图](./desktop.png)、[窄屏截图](./mobile.png)。
- 点击保存期间禁用开关，完成后状态为启用；模拟保存失败后保持启用并出现中文错误 toast。
- 模拟读取失败后开关禁用，点击重试恢复；焦点刷新生效。
- 本夹具未提供项目字体资源，浏览器使用回退字体；不把截图视作字体或完整设置弹窗的端到端验收。

## 验收映射与限制

1. CLI 无效参数、缺失构建、无用户 manager、linger 权限不足、状态只读：CLI 测试覆盖。
2. 重复启停、真实 enable 状态、unknown linger、更新失败恢复、不调用 start/stop：CLI 测试覆盖。
3. systemd 转义与 PATH/PORT：CLI 和实际解析器覆盖。
4. 桌面默认关闭、稳定路径、AppImage、XDG、写入失败：桌面逻辑单测与实际格式验证覆盖。
5. 加载、保存失败、重试、刷新、其他平台隐藏：组件单测及浏览器夹具覆盖；IPC 来源纯函数单测覆盖。
6. 后台服务复用/等待/超时：单测覆盖；单实例退出分支为源码检查，未进行两个正式应用进程并行启动的实机验证。

未执行真实 systemd enable/disable、loginctl enable-linger、注销或重启；未验证发行版/桌面环境的真实开机效果，未做 macOS 实机回归。真实应用安装、登录启动和无人登录开机验收仍需在目标设备完成。

## 审查修正验证（本轮独立执行）

| 检查 | 本次结果 |
| --- | --- |
| `pnpm vitest run tests/unit/lib/browser-bridge-rpc.test.ts tests/unit/lib/linux-autostart.test.ts tests/unit/lib/linux-startup-settings.test.ts` | 34 项通过，含 9 项跨进程桥接/API 测试和 4 项新增 GNOME 标记用例 |
| `pnpm test:cli` | 144 项通过 |
| `pnpm tsc --noEmit` | 通过；完整构建也再次完成应用类型检查 |
| `pnpm tsc --noEmit -p electron/tsconfig.json` | 通过；共享模块被 Electron 类型检查覆盖 |
| 改动文件 ESLint | RPC、客户端、CLI wrapper、5 个浏览器 API、测试夹具、Electron 文件均通过；CJS 原有导入例外沿用上文命令 |
| `pnpm build:electron` | Next.js、standalone 后处理、服务端与 Electron 构建通过 |
| `pnpm build:electron:main` 与 `pnpm exec electron-builder --linux AppImage --publish never` | 最后一次 desktop 解析修正后重新构建、打包均退出 0；更新 `release/purplemux-improved-0.5.6.AppImage`，未发布 |
| 最后一次 desktop 解析回归 | `pnpm vitest run tests/unit/lib/linux-autostart.test.ts` 20 项通过；相关文件 ESLint、Electron 完整类型检查再次通过 |
| 文档链接与差异格式 | 本需求 5 个 Markdown 文件的链接检查与 `git diff --check` 通过 |

跨进程验证真实启动独立 Node 子进程（PID 不同且父进程无浏览器 global），通过 Unix socket 调用现有 API 处理器。覆盖 URL/标题、PNG/base64 截图、eval 值和异常、控制台过滤、网络过滤及响应体；CDP 对象由子进程夹具替代，工作区与 token 检查使用受控测试数据。

另外覆盖目录/socket 权限、拒绝替换活跃 socket/普通文件、方法白名单、超时、连接中断后 503、正常退出后的重连以及 SIGKILL 后遗留 socket 的回收。同进程 global 优先路径仍通过。GNOME 测试使用临时 desktop 文件覆盖空白与 CRLF、Hidden、GNOME 标记、注释、其他段、无主段及重新启用。

本轮未操作真实 GNOME 启动管理器、真实 Electron 浏览器标签或系统启动项；未重复上一轮的视觉检查。跨进程通信回归不等同于真实 CDP/桌面环境端到端验收。

## 合并冲突验证（2026-10-19，本轮独立执行）

| 检查 | 本次结果 |
| --- | --- |
| 冲突两侧 JSON 值逐项比对 | 11 个 `settings.json` 均保留双方所有原值；自启动和更新两组词条共存，各语言键集合与英文一致 |
| 全部语言 JSON 解析 | 231 个文件通过 |
| `pnpm vitest run tests/unit/lib/browser-bridge-rpc.test.ts tests/unit/lib/linux-autostart.test.ts tests/unit/lib/linux-startup-settings.test.ts tests/unit/lib/desktop-updater.test.ts tests/unit/lib/app-update-api.test.ts tests/unit/lib/app-update-download.test.ts tests/unit/lib/app-update-guard.test.ts tests/unit/lib/app-update-manager.test.ts` | 69 项通过 |
| `pnpm test:cli` | 152 项通过，含服务启动监督器和自启动回归 |
| `pnpm tsc --noEmit` | 完整应用类型检查通过 |
| `pnpm tsc --noEmit -p electron/tsconfig.json` | 完整 Electron 类型检查通过 |
| `pnpm exec eslint --no-ignore --report-unused-disable-directives-severity off --rule "@typescript-eslint/no-require-imports: off" electron/main.ts electron/preload.ts bin/purplemux.js src/components/features/workspace/settings-dialog.tsx` | 通过 |
| `pnpm build:electron:main` | 主进程、preload 和 server-launcher 构建通过 |
| 冲突标记扫描、`git ls-files -u`、`git diff --check`、`git diff --cached --check` | 无遗留标记、无未解决条目，差异格式通过 |

升级退出分支的清理接线经过源码检查，实际 socket 关闭/重连由既有 RPC 测试覆盖；本轮未执行真实 Electron 升级退出、开机重启、浏览器视觉验证或 AppImage 重打包。冲突已暂存，未提交合并。

## PR #70 验证（2026-10-20，本轮独立执行）

| 检查 | 本次结果 |
| --- | --- |
| `pnpm vitest run tests/unit/lib/linux-autostart.test.ts tests/unit/lib/linux-startup-settings.test.ts tests/unit/lib/browser-bridge-rpc.test.ts` | 37 项通过；新增远程隐藏、能力等待/失败后重试、模式切换后的过期响应，以及远程 localhost 拒绝回归 |
| `pnpm test:cli` | 153 项通过，无跳过；覆盖旧 process unit 重注册为 control-group、不启停当前服务、真实 `systemd-analyze --user verify` 解析与监督器升级回退 |
| `pnpm tsc --noEmit` | 完整应用类型检查通过 |
| `pnpm tsc --noEmit -p electron/tsconfig.json` | 完整 Electron 类型检查通过 |
| 改动文件 ESLint | 下列命令通过，无错误或警告 |
| `pnpm build:electron` | 退出码 0；Next.js、standalone 后处理、服务端、Electron 主进程及 preload 构建全部通过 |
| Markdown 相对链接与 `git diff --check` | 通过 |

```bash
pnpm exec eslint --no-ignore --report-unused-disable-directives-severity off --rule "@typescript-eslint/no-require-imports: off" "bin/autostart.js" "electron/linux-autostart.ts" "electron/main.ts" "electron/preload.ts" "src/components/features/settings/linux-startup-settings.tsx" "tests/cli/autostart.test.cjs" "tests/unit/lib/linux-autostart.test.ts" "tests/unit/lib/linux-startup-settings.test.ts"
```

验收 9：临时目录测试验证新 unit 和旧 unit 更新为控制组清理，系统解析器验证有效性；真实 React 组件在 jsdom 中验证远程模式不显示、不读取/修改启动项，聚焦切回本地可恢复，本机状态读取失败仍可重试。能力 IPC 与读写 IPC 共用主进程校验；来源校验测试覆盖远程模式使用 localhost 仍被拒绝。

本轮未注册宿主机 unit、未终止真实监督器或验证实际 cgroup 清理、未启动真实 Electron 连接远端，也未做视觉验证或 AppImage 重打包。systemd 清理行为依据控制组配置与解析检查，组件验证使用模拟 IPC；不将其视作真实系统及桌面端到端验收。未提交、推送或发布。
