# 实施与验证记录

## 实施

2026-10-20，先编写本需求规格，再实现。

- `src/lib/pending-user-questions.ts`：读取 Claude 工具调用、Codex 同步/异步调用及事件格式。异步回答关联复用 `resolveAsyncQuestionAnswers`，同步结果、取消和新任务清理待回答问题。
- `src/lib/providers/{claude,codex}/runtime-snapshot.ts`：运行快照增加可选 `pendingUserQuestions`，缓存保留该字段；Claude 扫描窗口统一为 128 KiB。读取失败不把未知状态伪装成已回答。
- `src/lib/status-manager.ts`、`src/types/status.ts`、`src/hooks/use-agent-status.ts`、`src/hooks/use-tab-store.ts`：沿用全局状态 WebSocket 同步，不依赖对应时间线挂载；运行状态和输入队列语义不变。首次建立文件监听立即检查，补上文件监听建立前已经写入的问题。同步缺失 Tab 时清理提醒元数据，保留原有本地 Tab 保护。
- `src/hooks/use-question-notification.ts`、`src/pages/_app.tsx`：全局持久 Toast，项目名称、摘要、“打开”操作；按会话和调用去重，回答及删除撤销，导航检查当前会话身份。
- `src/hooks/use-native-notification.ts`、`electron/preload.ts`、`electron/main.ts`：复用 Electron 原生通知开关；为问题通知携带独立点击标识，校验会话及问题仍有效，避免多条通知打开同一个最后目标。待回答异步问题计入 Dock 角标，原生调用失败不影响 Toast。
- 11 个语言目录的 `notification.json`：补齐提醒标题。

实现按职责拆分问题读取与通知展示，复用回答匹配、状态同步、Sonner 和导航入口；不增加依赖、设置或数据库结构。

## 自动化验证

相关测试命令：

```bash
pnpm exec vitest run "tests/unit/lib/pending-user-questions.test.ts" "tests/unit/lib/question-notification.test.ts" "tests/unit/lib/question-native-notification.test.ts" "tests/unit/lib/agent-runtime-snapshot.test.ts" "tests/unit/lib/codex-review-state.test.ts" "tests/unit/lib/async-question-answers.test.ts" "tests/unit/lib/agent-state-transition.test.ts" "tests/unit/lib/session-parser-codex.test.ts" "tests/unit/lib/session-parser-claude.test.ts"
```

结果：9 个测试文件，92 项通过，0 项失败。

| 验收 | 本次证据 |
| --- | --- |
| 1：问题识别与异步结果 | pending-user-questions 与 agent-runtime-snapshot 测试覆盖工具前缀、事件格式、结果、缓存、回答和中断 |
| 2：全局提醒、隐藏页面与导航 | question-notification 在 jsdom 挂载真实 Hook/Tab Store，未挂载时间线，模拟隐藏页面，验证持久提醒及导航回调；当前 Tab 不设抑制条件 |
| 3：去重 | 重复 update、重连 sync、Hook 重挂载不重发；新调用及新会话重新提醒 |
| 4：撤销及过期保护 | 回答、删除、同步中缺失 Tab、过期事件及旧操作验证；输入发送路径未修改，待回答状态只依据服务端快照 |
| 5：原有状态与原生开关 | Codex 服务端广播测试保持 busy；状态机、解析和异步回答回归通过；原生通道以替身验证开关、导航、失败处理和 Dock 角标 |
| 6：静态检查及构建 | 见下方最终检查结果 |

- 完整 `pnpm tsc --noEmit`：通过；`pnpm exec tsc --noEmit -p "electron/tsconfig.json"`：通过。
- 改动的应用及测试 TypeScript 文件 ESLint：通过。Electron 目录被项目 ESLint 默认忽略，另执行 `pnpm exec eslint --no-ignore "electron/main.ts" "electron/preload.ts"`，通过。
- `pnpm build`：最终源码构建通过，包含 Next.js 生产编译、24 个静态页面生成、standalone 资源复制和服务端 tsup 打包。
- `pnpm build:electron:main`：通过，生成主进程、preload 与 server-launcher。
- `git diff --check`：通过；需求文档链接、depends_on 路径和 11 个语言文件的 JSON/标题键检查通过。
- 构建提示上层目录存在多个锁文件并自动推断 workspace root；未导致构建失败，未修改本需求外的构建配置。

## 范围与限制

- 未执行真实浏览器、移动设备或 Electron 桌面通知实机验收；jsdom 测试不代表视觉和操作系统权限验收通过。
- 普通浏览器提供应用内持久 Toast；隐藏页面回到前台可见。本次不新增浏览器系统通知权限申请，原有 Web Push 策略不变。
- 快照最多扫描 JSONL 尾部 128 KiB，窗口外的旧问题不纳入待回答列表。
- 未提交、推送或发布。

## 审查修正：回答事件与原生通知目标

本节为用户要求修复两条 P2 审查意见后的独立验证记录，前面的 92 项测试记录保留为上轮证据。

### 实施

- `pending-user-questions.ts` 增加 `item_completed/UserMessage` 处理，按现有 Codex 时间线解析规则拼接 `text` 块，忽略非文本块及畸形内容，复用已有回答匹配逻辑。
- 记录最近一次用户消息的文本及事件格式，跳过同一回答的另一种格式；遇到新问题时重置该比较状态。双格式记录不会重复消费另一个同文问题，也不会走“新任务”分支误清理无关问题。
- `use-native-notification.ts` 移除问题通知成功回调对普通通知共享目标的赋值及随之无用的会话回退变量。问题通知继续用自身标识定位，普通通知继续用原有目标；不新增 IPC 或配置。

### 本轮验证

- 先新增复现测试再改源码：两份相关测试文件运行得到 16 项通过、6 项失败，失败覆盖完成事件回答未撤销，以及普通通知目标被后发/延迟完成的问题通知覆盖。
- 修复后运行上方完整相关测试命令：9 个文件、102 项通过、0 项失败。
- 新增覆盖：`UserMessage` 独立回答、多文本块、无效块、两种事件顺序、其他待答问题保留、同文旧问题不被重复回答、新问题允许同文回答、实际文件读取及缓存更新、普通完成/需要输入通知与问题通知交错导航、延迟发送回调。
- `pnpm tsc --noEmit`：通过。
- `pnpm exec eslint "src/lib/pending-user-questions.ts" "src/hooks/use-native-notification.ts" "tests/unit/lib/pending-user-questions.test.ts" "tests/unit/lib/question-native-notification.test.ts" "tests/unit/lib/agent-runtime-snapshot.test.ts"`：通过。
- `git diff --check`：通过。`pnpm build`：通过，包含 Next.js 编译、24 个静态页面生成与服务端打包；仍提示既有的多个锁文件/workspace root 推断警告。
- 本轮未执行浏览器和 Electron 实机验收；通知通道通过 jsdom 中真实 Hook/Store 与 Electron API 替身验证。Electron 主进程与 preload 本轮未修改。
