# 实施与验证记录

## 实施

- `session-work-status-select.tsx`：真实 Base UI Select 展示工作阶段及自动模式，复用 `collectWorkSessions`、`useSessionWorkflowMutation` 和已有国际化文案；保存失败保留原状态。
- `session-meta-header.tsx`：统一桌面与移动面板的头部，状态选择独立于详情操作，窄容器只保留标题和状态。
- `session-meta-bar.tsx`、桌面及移动端 Claude/Codex 面板接入共享头部；桌面展开详情和移动 Sheet 保持各自原有行为。
- `session-meta-content.tsx`：按信息区容器宽度显示辅助元信息，避免长分支名挤掉窄屏标题。
- 使用当前显示的 provider/session ID，缺少 ID 时按 Tab 定位；加载、断连、身份不一致、迁移未完成、删除或无目标时禁用修改，身份变化关闭旧菜单。
- `docs/STATUS.md` 说明新增入口与运行状态的边界。无后端接口、配置格式、依赖及运行状态算法变更。
- KISS/DRY/SOLID：头部布局与状态交互分离，四个面板复用共享组件及已有状态规则；YAGNI：不增加快捷键、批量操作或新的状态体系。

## 自动化验证（2026-10-18）

```bash
pnpm exec vitest run \
  tests/unit/lib/chat-session-status.test.ts \
  tests/unit/lib/session-workflow.test.ts \
  tests/unit/lib/session-workflow-ui.test.ts \
  tests/unit/lib/session-workflow-storage.test.ts \
  tests/unit/lib/session-workflow-api.test.ts \
  tests/unit/lib/session-workflow-reconnect.test.ts
```

结果：**69 项通过**，其中新增真实菜单/头部交互测试 13 项。

```bash
pnpm exec eslint \
  src/components/features/workspace/session-work-status-select.tsx \
  src/components/features/workspace/session-meta-header.tsx \
  src/components/features/workspace/session-meta-bar.tsx \
  src/components/features/workspace/session-meta-content.tsx \
  src/components/features/workspace/claude-code-panel.tsx \
  src/components/features/workspace/codex-panel.tsx \
  src/components/features/mobile/mobile-claude-code-panel.tsx \
  src/components/features/mobile/mobile-codex-panel.tsx \
  tests/unit/lib/chat-session-status.test.ts
```

结果：无错误、无警告。

其他检查：

- `pnpm exec tsc --noEmit`：最终完整 TypeScript 检查通过。
- `pnpm build`：最终 Next.js 页面编译、静态页面生成、standalone 产物整理及 tsup 服务端构建全部通过。
- `git diff --check`：通过。
- 规格依赖、文档及截图相对链接检查：通过。

## 浏览器组件验证

使用 agent-browser 的独立 `chat-status-edit` 会话，在本地隔离页面加载真实 SessionMetaBar、共享头部、状态 Select、Zustand Store 和最终生产 CSS；API/元信息请求使用 fixture。该页面位于 `/tmp/chat-status-browser-liuh4xe2`，未添加应用路由或改动用户工作区数据。

- 1280×800：状态菜单展开，四种阶段与自动判断可见；自动模式勾选正确，信息栏详情保持收起。
- 320×720：长标题截断但可见，状态文字完整；信息区隐藏辅助元信息，`scrollWidth === innerWidth === 320`。
- 390px 深色：Claude 标记完成后 Codex 仍为审批中；Codex 单独修改进行中。通过 CDP 触摸模拟确认 `pointer: coarse`，两个状态按钮实际高度均为 44px。
- Claude 从人工完成恢复自动后显示审批中，Store 仅保留 Codex 的人工进行中；两处详情仍为 `aria-expanded=false`。
- 浏览器初次窄屏检查发现旧元信息布局会挤掉标题，修正容器自适应后重新构建并复查截图。

截图：

- [桌面菜单](./result/desktop-menu.png)
- [320px 浅色](./result/mobile-light.png)
- [移动深色菜单](./result/mobile-dark-menu.png)

## 验收映射

| 编号 | 本次证据 |
| --- | --- |
| CE-01 | 桌面/移动 Claude/Codex 四处接入源码检查；真实共享头部交互测试及生产编译 |
| CE-02 | 两个 provider 分别逐项选择四种状态、恢复自动；确认 PATCH key 与共享状态 |
| CE-03 | 保存延迟时禁用且保留旧值、失败提示、Store 更新；既有 API/存储/重连测试本次重跑 |
| CE-04 | 无 ID 保存、首次迁移等待、新会话不继承、provider 不匹配和旧缓存隔离测试 |
| CE-05 | disabled 加载/断连入口、删除、缺失 Tab、身份切换关闭旧菜单测试；四个面板的连接/加载条件源码检查 |
| CE-06 | 真实 Select 键盘打开/Escape、详情 Enter 展开；移动 Sheet 回调与状态选择互不触发 |
| CE-07 | 1280/320/390px 真实组件浏览器检查、浅深色截图、触摸模拟下 44px 入口；手机实机未执行 |
| CE-08 | 69 项测试、改动文件 ESLint、最终完整 TypeScript 和生产构建通过 |

## 验证边界

浏览器使用本次真实组件和生产样式，替换元信息请求及状态保存为隔离测试数据，不连接用户工作区。隔离页面未提供字体资源，截图使用浏览器回退字体，未验证自定义区域字体组合。真实多客户端 WebSocket 与手机实机验收未执行；本次重跑既有同步/存储测试，不将其记作实机联调。

## Review P2：保存后的键盘焦点（2026-10-18）

问题与修复：`saving` 原先参与 Select 的 React key，保存开始/结束均重建触发器，焦点落入 body。新增 4 项真实组件测试在修复前全部失败，复现了 DOM 替换及焦点丢失。

- 从 `unavailable` 移除 `saving`，因此保存不再改变 key；身份失效或会话变化仍关闭旧菜单。
- 使用 Select 原生 `readOnly={saving}` 禁止重复交互，保留可聚焦触发器；提交回调也检查 `saving`。
- 菜单关闭时由 Base UI 恢复原触发器焦点。成功/失败不再重建节点，也不另加延时抢焦点；用户移焦、切换会话后的迟到响应不会抢回焦点。遵循 KISS，复用现有组件能力。

本次运行：

```bash
pnpm exec vitest run --maxWorkers=1 \
  tests/unit/lib/chat-session-status.test.ts \
  tests/unit/lib/session-workflow.test.ts \
  tests/unit/lib/session-workflow-ui.test.ts \
  tests/unit/lib/session-workflow-storage.test.ts \
  tests/unit/lib/session-workflow-api.test.ts \
  tests/unit/lib/session-workflow-reconnect.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/components/features/workspace/session-work-status-select.tsx tests/unit/lib/chat-session-status.test.ts
git diff --check
```

结果：**73 项通过**（Chat 交互测试 17 项），完整 TypeScript 和 ESLint 通过。首次与其他检查并行执行时，一项已有逐状态选择测试在 5176ms 后超出默认 5s 时限；未改超时配置，以单 worker 重跑上述集合全部通过。

新增 CE-09 验证：成功/失败期间保持同一触发器与焦点、保存期间无法重开菜单或重复提交、保存后 ArrowDown 可继续操作、主动移焦及切换会话不抢焦点；原身份切换关闭菜单回归继续通过。

浏览器使用独立 `chat-status-focus` 会话，重新打包本次真实组件，复用隔离页面和原生产 CSS。通过真实键盘选择及受控延迟响应检查：

| 场景 | 观测结果 |
| --- | --- |
| 保存等待 | `sameNode=true`、`focused=true`、`aria-readonly=true`、菜单已关闭 |
| 保存成功 | `sameNode=true`、`focused=true`、只读解除，可直接键盘重开菜单 |
| 保存失败 | `sameNode=true`、`focused=true`、只读解除，旧状态保持且错误提示出现 |
| 等待中聚焦另一会话按钮 | 响应后 `focusRetainedElsewhere=true`，原按钮未夺回焦点 |

本次未重跑生产构建：修改限于选择器交互属性及提交保护，已执行完整类型检查、相关测试和真实浏览器验证；上文构建记录属于此前实现验证，不作为本次运行结果。

## PR #59 P2：Portal 菜单与展开详情的事件隔离（2026-10-18）

对应[审查意见](https://github.com/stirp/purplemux-improved/pull/59#discussion_r4306490789)，审查及修复基线为 `1dee94d8b9cafc5859d08ec6bd47234c05be0be3`。

根因：状态菜单 Portal 的 DOM 不在 SessionMetaBar 的 containerRef 内，菜单选项的 mousedown 冒泡到 document，被已有详情关闭监听误判为外部点击。新增真实组件用例在修复前复现详情意外收起；新增 Escape 用例在当前 Base UI 版本已通过，也作为分层关闭行为的回归保护保留。

修复在本业务 SelectContent 上阻止 mousedown 及 Escape 的冒泡，保留 Base UI 自身选择、菜单关闭和焦点恢复，不改第三方组件或全局事件监听。复用组件事件机制，改动局限于菜单边界，符合 KISS/单一职责。

本次验证：

```bash
pnpm exec vitest run --maxWorkers=1 \
  tests/unit/lib/chat-session-status.test.ts \
  tests/unit/lib/session-workflow.test.ts \
  tests/unit/lib/session-workflow-ui.test.ts \
  tests/unit/lib/session-workflow-storage.test.ts \
  tests/unit/lib/session-workflow-api.test.ts \
  tests/unit/lib/session-workflow-reconnect.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/components/features/workspace/session-work-status-select.tsx tests/unit/lib/chat-session-status.test.ts
git diff --check
```

结果：**75 项通过**（Chat 真实组件交互 19 项），完整 TypeScript、改动文件 ESLint 和差异格式检查通过。

CE-10 浏览器验证使用 agent-browser 独立 `pr59-menu` 会话，隔离页面 `/tmp/pr59-browser-5rvy_qmd` 重新打包真实组件，复用已有 CSS，元信息/保存请求为 fixture。真实鼠标和键盘操作结果：

- 展开详情后打开菜单并选择已完成：状态更新，详情 `aria-expanded=true`。
- 再次打开菜单后按 Escape：菜单 `aria-expanded=false`，详情仍为 `true`。
- 再次按 Escape：详情变为 `false`。
- 再次展开详情后点击外部按钮：详情变为 `false`。

本次未重跑生产构建，已使用真实浏览器验证事件修复。未执行远端发布、真实多客户端或手机实机联调；隔离页面不连接用户工作区数据。
