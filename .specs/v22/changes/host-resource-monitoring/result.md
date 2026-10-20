# 实施与验证记录

## 实施

本次按 [spec.md](./spec.md) 实现；DETAILED 为规格状态，以下分别记录代码和实际验证。

- `src/lib/system-resources.ts`：按需采样整机 CPU 和内存；多核时间差归一化，首采样/长间隔返回未知。Linux 读取 MemAvailable，其他情况回退 OS 空闲内存。globalThis 共享 2 秒缓存和并发请求，无后台定时器、进程扫描或 tmux 调用。
- `src/pages/api/system/resources.ts`、`src/types/system-resources.ts`：只读 GET 接口及客户端共享数据类型，no-store、405/503 行为；继续由现有 proxy 鉴权。
- `src/hooks/use-system-resources.ts`：替换 Electron IPC 为服务端接口，3 秒间隔、5 秒超时，后台/卸载时中止，失败清空数字，恢复自动刷新。
- `src/components/layout/system-resources.tsx`：共享监控和详情内容；桌面 Popover、移动 Sheet，百分比、警示文字、内存已用/总量、统计口径和采样时间；关闭设置后卸载采集组件。
- `src/components/layout/app-header.tsx`：接入移动入口，沿用顶栏高度；360px 以下隐藏品牌与分隔符，长项目名省略。菜单、退出及详情关闭热区至少 44px；为退出补上可访问名称。
- `src/hooks/use-config-store.ts`、`settings-dialog.tsx`：缺失配置默认开启，明确 false 保留；各端均能操作原设置。保留原配置保存通道。
- `messages/*/header.json`、`settings.json`：11 种语言的资源文案及设置说明。
- 保留旧 Electron IPC 接口供兼容，当前资源组件不再调用它；原 tmux 数量不再与整机资源混排。

采样、轮询与展示分别承担单一职责；两端共用数据及详情，复用既有配置、Popover、Sheet，无新增依赖或历史存储，遵循 SRP、DRY、KISS、YAGNI。

## 自动化验证

2026-10-20，在当前工作树实际执行，Linux / Node 22.14.0。复用已有 node_modules；后续直接调用工具入口，未改 package.json 或 lockfile。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 资源采样、API、轮询及组件 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/system-resources.test.ts tests/unit/lib/system-resources-ui.test.ts tests/unit/api/system-resources.test.ts` | 3 文件，24 项通过 |
| 配置及消息入口回归 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/config-snapshot.test.ts tests/unit/lib/config-sync-hook.test.ts tests/unit/lib/messages-proxy.test.ts` | 3 文件，5 项通过 |
| 完整类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | 通过 |
| 改动源码及测试 ESLint | `node node_modules/eslint/bin/eslint.js` 后接本次 11 个 TS/TSX 文件 | 通过，最后纯缩进调整后另检查 settings-dialog |
| 文档、词条及差异 | 规格相对链接检查、11 种语言资源键一致性、`git diff --check` | 通过 |

24 项测试覆盖多核 0/25/100% CPU、首次/长间隔/核心数变化/计数重置、Linux 可用内存/读取错误/其他平台、并发和 HMR 缓存、失败恢复、方法限制、后台/关闭/卸载/超时/迟到响应、默认兼容、两端详情和警示文案。

## 浏览器验证

使用 agent-browser 独立会话 `host-resource-monitoring`，临时验证页 `http://127.0.0.1:18347`。直接编译本工作树真实 AppHeader、SystemResources、Hook、UI 组件和 Tailwind CSS；工作区编辑弹窗与通知计数使用替身，聊天区为布局占位。资源请求可注入高用量、错误、首采样；正常模式调用由真实 API handler 编译的临时 Node 服务读取当前主机 CPU/内存。

| 验收 | 实际结果 |
| --- | --- |
| 320/390/430px、740×360 横屏、1280px 桌面 × 浅深色 × 16/20px 根字号 | 共 20 组通过，无横向溢出；弹层边界位于视口内 |
| 长中英文项目名、新增热区 | 项目名省略，监控不被挤掉；移动资源按钮、详情关闭按钮至少 44px；320px 大字号仍可读两项资源 |
| 短屏及字号放大 | 标题与关闭按钮固定，详情内部可滚动至末尾 |
| 打开、Escape、关闭按钮、遮罩、焦点 | 20 组 Escape 关闭后恢复触发按钮焦点；额外检查关闭按钮和遮罩均通过 |
| 首采样、高用量、请求失败及恢复 | CPU 未知时显示采样中；93%/88% 显示高/偏高；错误显示暂不可用，成功后恢复数值 |
| 设置关闭 | 隐藏入口，等待超过一个轮询周期，请求计数不增长 |
| 真实服务器数据 | 重新开启并切换真实接口，观察到 CPU 15%、内存 49%；为当时主机快照，不代表性能基线 |

证据：

- [布局测量及焦点结果](./result/layout-results.json)、[状态及实际采样结果](./result/state-results.json)
- [移动顶栏](./result/mobile-header.png)、[320px 放大文字](./result/mobile-320-large.png)
- [移动详情浅色](./result/mobile-details-light.png)、[移动详情深色](./result/mobile-details-dark.png)
- [横屏大字号详情滚动](./result/landscape-large.png)、[桌面详情](./result/desktop-details.png)、[错误提示](./result/mobile-error.png)

## 限制与未执行项

- 浏览器为真实组件隔离验证，未启动完整 Next/终端工作区端到端流程；接口鉴权沿用 proxy 匹配范围并经源码检查，临时 Node 验证页不含登录链路。
- 未执行生产构建、Electron 安装包、macOS 实机或 iPhone/Android 实机、实际软键盘及非零安全区测试；其他平台内存回退为单测覆盖。
- 未实际保存用户监控设置；开关测试使用真实配置 store 的内存状态，持久化沿用原有通道。
- 无 Git 提交、推送或发布。


## PR #77 评审修复（2026-10-21）

问题来源：[首屏未加载已保存监控开关](https://github.com/stirp/purplemux-improved/pull/77#discussion_r4328216353)。本次读取 PR 全部行内意见，只有这一项；本地起点与被评审提交均为 `c4954106`。

### 原因与修复

直接打开 `/stats`、`/reports`、`/webview` 时，服务端原本只返回词条，应用也仅在获得工作区数据时初始化配置。因而资源监控先使用默认 true，已保存的 false 无法在首屏生效；即使后续 WebSocket 同步成功，也会产生不应出现的采样请求。

- `src/lib/require-auth.ts`：通过已有认证页面公共入口补齐 `initialConfig`，复用 `toPublicConfig` 去除认证秘密，并附上首页同样的 `hostEnvLocked`、`bindHostIsLocal`。页面已有配置不重复读取；认证失败、预检重定向及页面 redirect/notFound 保持原行为。
- `src/pages/_app.tsx`：将工作区与配置的一次性初始化标记分开；有配置即在渲染布局前 hydrate。非首页初始化配置后，后续首页仍能初始化工作区；路由重渲染不重复应用旧首屏配置。
- 沿用共享服务端入口与配置投影，未引入额外客户端配置请求或另一套同步状态机，保持 KISS、DRY 与原有快照防回退约定。

### 本次验证

- 新增 `require-auth-config.test.ts`：实际调用三个页面的 getServerSideProps，验证已保存关闭值、秘密剔除及环境派生字段，并覆盖首页快照保留、认证失败、预检失败、redirect/notFound。
- 新增 `app-config-hydration.test.ts`：挂载真实 App、配置 store、SystemResources 和轮询 Hook，隔离通知/主题等无关副作用；验证无工作区首屏关闭时推进 10 秒仍无 fetch、true/缺失默认采样、延迟工作区初始化及旧 props 不覆盖配置。
- `node node_modules/vitest/vitest.mjs run tests/unit/lib/require-auth-config.test.ts tests/unit/lib/app-config-hydration.test.ts tests/unit/lib/system-resources.test.ts tests/unit/lib/system-resources-ui.test.ts tests/unit/api/system-resources.test.ts tests/unit/lib/config-snapshot.test.ts tests/unit/lib/config-sync-hook.test.ts tests/unit/lib/messages-proxy.test.ts tests/unit/lib/file-preview.test.ts`：9 文件、58 项通过，其中新增 13 项。
- `node node_modules/eslint/bin/eslint.js src/lib/require-auth.ts src/pages/_app.tsx tests/unit/lib/require-auth-config.test.ts tests/unit/lib/app-config-hydration.test.ts`：通过。
- `node node_modules/typescript/bin/tsc --noEmit`：最终代码通过；Next 构建内置完整 TypeScript 检查也通过。
- `node node_modules/next/dist/bin/next build --webpack`：生产编译成功（约 3.9 分钟），但完整构建失败于收集 `/login` 页面数据：`ReferenceError: self is not defined`。错误模块为现有 `@xterm/addon-clipboard` 的浏览器 UMD 入口，调用路径为 `login → onboarding-wizard → install-dialog → use-terminal`；这些源码和依赖未在本次修改。独立 Node require 该依赖同样报错。本次未修改此登录终端链路，也未宣称完整构建通过。
- 构建另提示多 lockfile 导致工作区根目录推断为 `/home/home`；本次没有调整共享构建配置。
- `git diff --check`、规格依赖和相对链接检查：通过。

本次不涉及视觉布局改动；未重跑前文浏览器布局验收，也未执行手机/Electron 实机或已登录完整应用端到端。测试不写用户配置，未提交或推送代码、发布或修改 PR 线程状态。
