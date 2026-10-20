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
