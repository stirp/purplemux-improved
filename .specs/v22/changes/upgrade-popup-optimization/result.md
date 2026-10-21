# 升级提示优化：实施与验证

## 实施

本次先编写 [增量规格](./spec.md)，再修改实现；基线为 [自动更新](../auto-upgrade-detection/spec.md)。

- `src/lib/app-update-manager.ts`：跳过目标版本、读写偏好、清除已下载版本的检查固定；强制升级仅为单次参数，跳过两次空闲检查。普通升级仍执行原保护，进行中的普通安装不会被并发强制请求提升权限。强制请求校验确认版本，避免在后台检查更新目标后安装未经确认的版本。
- `src/lib/workspace-store.ts`、`src/types/terminal.ts`：在 `workspaces.json` 保存独立的 server/desktop 跳过版本，纳入写入去重键。复用既有串行锁、严格读取和原子写入，保留其他字段；旧配置缺省为未跳过。
- `src/lib/app-update-server.ts`、`src/pages/api/app-update.ts`、`electron/app-updater.ts`、`electron/main.ts`、`electron/preload.ts`：连接双端持久化及新动作，保留原有 HTTP/IPC 来源保护。桌面原生菜单增加跳过和强制升级确认，取消不安装。
- `electron/app-update-preferences.ts`：本机服务存在时，通过本机鉴权 API `skip-desktop-version` 转发偏好写入，避免桌面进程与服务端同时读改写工作区文件。服务拒绝、断线或服务锁存在但尚未就绪时报错，不直接写入；远程模式且无本机服务/服务锁时本机保存。服务端转发只保存 desktop 字段，不操作服务端更新状态。
- `src/hooks/use-app-update.ts`、`src/components/features/settings/app-update-settings.tsx`：传递目标版本，跳过后隐藏自动提示，设置页保留手动入口；强制操作先确认，版本变化时禁用旧确认。保存失败显示实际错误，忙碌时禁用操作。移动端文案与按钮换行，避免新增按钮挤压版本文案。
- `messages/*/settings.json`：11 种语言增加跳过、已跳过、强制确认及取消文案，阻断提示解释可选择强制升级。
- `docs/STATUS.md`：补充强制升级的单次例外，不改变工作树/回收保护。
- `electron/tsconfig.json`：新增 ES2022/DOM 类型库，匹配现有 Electron 运行时与共享存储代码使用的 `Object.hasOwn`、`Array.at`；保留原编译 target 和运行依赖。

原则应用：共用管理器和平台依赖回调承接两端行为（DRY、单一职责、依赖倒置）；复用现有存储和确认组件（KISS）；不增加全局强制开关、自动安装、延迟重启或包清理（YAGNI）。

## 自动化验证

环境：Linux，Node v24.14.1，pnpm 12.11.2。本工作树通过 `node_modules` 符号链接复用主工作区已有依赖，未修改依赖和锁文件。

| 检查 | 本次结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/app-update*.test.ts tests/unit/lib/desktop-updater.test.ts tests/unit/lib/desktop-update-preferences.test.ts tests/unit/lib/workspace-last-opened.test.ts tests/unit/lib/workspace-reorder.test.ts tests/unit/lib/idle-tab-api.test.ts tests/unit/api/terminal-keys.test.ts` | 100 项通过 |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm exec tsc --noEmit -p electron/tsconfig.json` | 通过；接入共享存储后发现 ES2020 类型库不足，补充 ES2022 后重新检查通过 |
| 改动及新增 TS/TSX 文件执行 `pnpm exec eslint --no-ignore ...` | 通过，包含 Electron 文件；测试中 next-intl 的必填 children 类型适配已修正 |
| `pnpm build:server` | 通过 |
| `pnpm build:electron:main` | 通过 |
| `pnpm exec next build --webpack` | 类型检查和 Webpack 编译通过，收集 `/login` 页面数据失败：`ReferenceError: self is not defined` |
| `git diff --check` | 通过 |

Web 构建阻断定位：`login.tsx → onboarding-wizard.tsx → install-dialog.tsx → use-terminal.ts → @xterm/addon-clipboard`。直接在 Node 中 `require('@xterm/addon-clipboard')` 同样报 `self is not defined`。`git show HEAD:src/hooks/use-terminal.ts` 确认该静态导入在本次修改前已存在；上述源文件未修改。未在本次需求扩展修复登录页/终端初始化，也未将 Web 完整构建标记为通过。最后增加的本机偏好转发由相关单测、类型检查与 Electron 构建验证；没有重复执行已知受阻的完整 Web 构建。

## 浏览器验证

使用 agent-browser 独立会话 `upgrade-popup-ws-b4hr9B`，在 `127.0.0.1:18391` 临时页面加载真实更新组件、hook、SWR、shadcn 确认框、中文词条和由实际全局样式生成的 CSS。HTTP 与 Electron bridge 均为模拟，仅记录动作，不调用真实更新服务。

- 320px 与 390px：版本文案正常显示，按钮按空间换行；390px 的 `scrollWidth === innerWidth === 390`，没有横向溢出。
- 点击强制升级出现目标 `0.6.0` 和中断风险；取消时动作记录为空，确认时仅发送一次 `{ action: 'force-install', version: '0.6.0' }`。
- 模拟进入下载后，所有升级/跳过按钮禁用。
- 工作区跳过后提示消失，仅发送 skip 动作，无下载/重启动作。
- 1280px 模拟 Electron 设置页：跳过后显示已跳过版本，仍保留普通和强制升级按钮。
- 自动化 DOM 测试进一步覆盖新版本恢复提示、跳过失败仍可操作、错误优先显示、各忙碌阶段和桌面动作不降级到 HTTP。

截图：[移动端操作](./result/mobile-actions.png)、[移动端强制确认](./result/mobile-force-confirm.png)、[桌面已跳过状态](./result/desktop-skipped.png)。浏览器验收为组件集成，不代表完整应用页面或原生 Electron 实机验收。
隔离页面没有挂载应用字体文件和 favicon，相关资源返回 404；截图使用浏览器回退字体，不作为自定义字体验收。

## 验收映射与限制

| 规格验收 | 证据 |
| --- | --- |
| 1：持久化、旧配置、后续版本、手动安装及失败 | manager/preferences/UI 单测；桌面设置浏览器检查 |
| 2：过期版本、并发操作及下载后跳过 | manager 单测 |
| 3：两次普通检查、强制绕过、包复用和单次权限 | manager、guard、desktop-updater 单测 |
| 4：运行方式、目标版本、下载/原生准备失败 | manager、desktop-updater 单测 |
| 5：HTTP/bridge、确认取消与来源保护 | API、DOM、desktop-update-preferences 单测及浏览器；原生 IPC 来源校验经源码检查 |
| 6：验证记录 | 上表；Web 完整构建受阻已单独标记 |

没有真实 npm 安装切换、桌面安装、服务重启或发布；未执行原生 Electron 菜单实机交互、macOS/Windows 实机验收。未执行 Git 提交、推送或分支操作。

## Review P1/P2 修正

本轮按同一需求的修正先补充规格验收 7、8，再修改代码；以下为本轮实际结果，不引用前文历史运行作为本轮验收。

### 实施

- P1：移除 `electron/main.ts` 对 `workspace-store` 的静态导入。偏好读写等待共享的 `desktopRuntimeReady` 后，才动态加载工作区存储。
- 新增 `electron/desktop-runtime.ts`，依次执行 Shell 环境解析、pristine 环境捕获、standalone `NODE_PATH` 与 Node 模块路径初始化。调用位于 bootstrap 的公共阶段，覆盖内嵌本地服务、复用后台服务、远程连接及开发入口；不再依赖只有内嵌服务启动时才会执行的 `startLocalServer()`。路径使用系统分隔符且去重。
- P2：更新管理器即时快照新增可选 `installing` 字段，根据当前安装操作及重启阶段推导，不另存一份容易漂移的状态。等待在途版本检测的安装请求也明确标记为安装中。
- 工作区提示不再用通用 `busy` 判断是否恢复显示：后台 `checking` 与同版本 `available` 保持隐藏；主动安装检查、下载、重启及错误/阻断仍显示。设置页继续保留手动入口。字段缺省兼容旧更新状态，下载、就绪、阻断及重启阶段保留原显示行为。

本次复用既有存储及平台初始化函数，仅提取共用初始化顺序（KISS/DRY）；环境初始化与更新偏好各自负责自身行为（单一职责），安装标记直接派生而非维护新状态机（YAGNI）。

### 本轮验证

| 检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/app-update*.test.ts tests/unit/lib/desktop-updater.test.ts tests/unit/lib/desktop-update-preferences.test.ts tests/unit/lib/desktop-bootstrap.test.ts tests/unit/lib/desktop-runtime.test.ts --maxWorkers=2` | 10 个文件、71 项全部通过 |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm exec tsc --noEmit -p electron/tsconfig.json` | 通过 |
| 本轮改动文件 `pnpm exec eslint --no-ignore ...` | 通过，包含 Electron 主入口、新初始化模块和新增测试 |
| `pnpm build:electron:main` | 通过 |
| `pnpm build:server` | 通过 |
| `git diff --check`、规格链接检查 | 通过 |

新增验证证据：

- `desktop-bootstrap.test.ts` 使用项目实际 tsup 配置，将 Electron 三个入口构建到临时目录；在只允许 Node 内置模块与模拟 Electron 的 VM 中执行真实 `main.js`。不提供根目录第三方依赖，验证可注册 `ready` 事件，且不会提前设置 `__PMUX_PRISTINE_ENV` 或加载 zod/dayjs/pino。文件读取隔离于用户配置。
- `desktop-runtime.test.ts` 延迟模拟 Shell 解析，确认解析前没有 pristine 快照且无法解析测试依赖；完成后快照包含解析后的 Shell 环境，Node 可加载仅放在临时 `.next/standalone/node_modules` 的依赖。再次初始化不会重复插入路径。
- `app-update-ui.test.ts` 增加后台 checking/available 隐藏、主动安装 checking/downloading/restarting 显示、错误/阻断可见的 DOM 回归；原有更高版本恢复提示测试继续通过。
- `app-update-manager.test.ts` 与 `app-update-api.test.ts` 验证后台检测 `installing=false`、待检测安装与首次空闲检查 `installing=true`、阻断完成后复位，以及 HTTP 202 即时响应携带安装标记。

首次同时执行测试、两套类型检查和构建时，原有存储测试在约 5.09 秒处失败；其余 70 项通过。构建/类型检查结束后以 `--maxWorkers=2` 重跑整组，71 项全部通过，没有放宽断言或提高该测试的超时配置。

本轮未执行完整 Web 构建或新的真实浏览器截图；UI 使用真实组件的 jsdom 交互回归，构建覆盖服务端与桌面。启动冒烟仅执行到 bootstrap 前的入口注册阶段，环境顺序由独立测试覆盖；不等同于安装包 GUI 启动、签名安装或真实升级重启验收。前文 Web 构建阻断和截图属于上一轮，不能当作本轮执行结果。
