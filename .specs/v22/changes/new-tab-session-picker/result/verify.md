# 验证记录

日期：2026-10-29。规格状态 DETAILED 表示行为约定完整，不代表真实 Agent 进程验收。

## 首次实现自动化检查（评审修正前）

```bash
pnpm exec vitest run "tests/unit/lib/new-tab-sessions.test.ts" "tests/unit/lib/new-tab-session-api.test.ts" "tests/unit/lib/new-tab-picker.test.ts" "tests/unit/lib/session-workspace-navigation.test.ts" "tests/unit/lib/layout-tab-creation-callers.test.ts" "tests/unit/lib/session-history-api.test.ts" "tests/unit/lib/idle-tab-reclaimer.test.ts" "tests/unit/lib/layout-tab-creation-client.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/pages/api/timeline/sessions.ts" "src/lib/new-tab-sessions.ts" "src/hooks/use-new-tab-sessions.ts" "src/hooks/use-layout.ts" "src/components/features/workspace/new-tab-picker.tsx" "src/components/features/workspace/pane-new-tab-menu.tsx" "src/components/features/workspace/pane-container.tsx" "src/components/features/mobile/mobile-new-tab-dialog.tsx" "src/components/features/mobile/mobile-terminal-page.tsx" "tests/unit/lib/new-tab-sessions.test.ts" "tests/unit/lib/new-tab-session-api.test.ts" "tests/unit/lib/new-tab-picker.test.ts" "tests/unit/lib/session-workspace-navigation.test.ts" "tests/unit/lib/layout-tab-creation-callers.test.ts"
pnpm build
git diff --check
```

- 相关测试：8 个文件、95 项通过。
- 改动文件 ESLint：通过。
- 最终完整 TypeScript 检查：通过。
- 最终生产构建：Next 页面/API、post-build 和服务端 tsup 全部通过。
- 差异空白检查、需求目录内链接及 depends_on 路径检查：通过。

## 首次实现验收映射（评审修正前）

| 验收项 | 本次证据 |
| --- | --- |
| 应用与会话直接显示，取消不创建终端 | picker DOM 测试覆盖两端，打开时创建回调未触发；真实桌面/移动容器浏览器截图 |
| 全部 Tab 回收后仍可查询 | API 测试仅提供 cwd，断言不调用 hasSession；保留身份、原目录及跨项目排除的合并测试 |
| 合并、标题、去重、隐藏、分页与搜索 | 数据测试覆盖 provider 隔离、标题优先、去重、目录分页及部分失败；DOM/浏览器搜索检查 |
| 恢复或复用 | 原有导航回归覆盖两类 provider 的已有 Tab 复用；新增断言发起 pane、原目录、session ID；cwd 回退不进入 check；恢复失败/布局未就绪保留选择器 |
| 新建应用兼容 | DOM 测试检查完整启动命令与失败重试；真实桌面/移动创建回调测试检查命令透传及启动状态 |
| 窄屏与键盘 | 320×740 弹窗宽 304px，无页面横向溢出；搜索空态、深浅色截图；方向键焦点 DOM 测试 |

## 浏览器验证与限制

使用 agent-browser 的独立会话，加载由真实 `PaneNewTabMenu`、`MobileNewTabDialog`、`NewTabPicker` 与项目 Tailwind 样式构建的临时组件验证页。数据、安装检查、导航回调为模拟值；不等同于应用联调或真实 Agent 恢复验收。

- [桌面](./desktop.png)：1280×577，弹层 448×462，列表内部滚动；目录搜索由 24 条筛选到 12 条。
- [320px 移动端](./mobile-320.png)：三个应用入口同行，长标题/路径截断，无横向溢出；部分读取失败时列表仍可见。
- [移动端深色](./mobile-320-dark.png)及[搜索无结果](./mobile-search-empty.png)：提示、输入框与滚动区域可见。
- 临时页未提供项目字体文件，截图使用浏览器字体回退；未测试手机实机、真实 Agent 安装/恢复或真实项目自动回收。Codex 原生查询沿用现有接口的默认时间窗口，应用保留会话不受窗口限制。
- 临时浏览器和 HTTP 服务已关闭；未执行 Git 提交、推送或发布。

## 评审修正验证（2026-10-29，本轮重新执行）

```bash
pnpm exec vitest run "tests/unit/lib/new-tab-sessions.test.ts" "tests/unit/lib/new-tab-session-api.test.ts" "tests/unit/lib/new-tab-picker.test.ts" "tests/unit/lib/session-workspace-navigation.test.ts" "tests/unit/lib/layout-tab-creation-callers.test.ts" "tests/unit/lib/session-history-api.test.ts" "tests/unit/lib/idle-tab-reclaimer.test.ts" "tests/unit/lib/layout-tab-creation-client.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/pages/api/timeline/sessions.ts" "src/lib/new-tab-sessions.ts" "src/hooks/use-new-tab-sessions.ts" "src/hooks/use-new-tab-action-store.ts" "src/hooks/use-layout.ts" "src/components/features/workspace/new-tab-picker.tsx" "src/components/features/workspace/pane-new-tab-menu.tsx" "src/components/features/workspace/pane-container.tsx" "src/components/features/mobile/mobile-new-tab-dialog.tsx" "src/components/features/mobile/mobile-terminal-page.tsx" "tests/unit/lib/new-tab-sessions.test.ts" "tests/unit/lib/new-tab-session-api.test.ts" "tests/unit/lib/new-tab-picker.test.ts" "tests/unit/lib/session-workspace-navigation.test.ts" "tests/unit/lib/layout-tab-creation-callers.test.ts"
pnpm build
git diff --check
```

- 相关测试：8 个文件、109 项通过，比首次增加 14 项。
- 完整 TypeScript、上述改动文件 ESLint：通过。
- 生产构建：Next 类型检查、生产编译、页面生成、post-build 和服务端 tsup 均成功。
- 差异格式检查通过；用本地 Python 检查需求文档链接、depends_on 路径及新增源码/测试/文档尾随空白，全部通过。

| 评审问题 | 修复与本轮证据 |
| --- | --- |
| 共享目录混入其他工作区会话 | 三种数据来源分别覆盖活动 Tab、回收索引、历史归属；原生同身份被排除，不同 provider 同 ID 仍保留；活动归属覆盖旧保留归属 |
| 关闭重开绕过恢复互斥 | 两端 picker 在延迟恢复期间真实卸载/重挂载，只触发一次导航；完成不关闭新实例；网络失败释放状态，重试成功；另覆盖两个 pane 同一事件周期点击、安装检查拒绝和创建应用关闭重开 |
| 后续分页失败丢弃已读取数据 | 移除逐页读取路径；两目录各 250 条会话一次完整读取，另一 provider 失败仍保留 500 条；单目录失败保留其他目录，重试可恢复失败来源 |
| 每页重复全量扫描 | API 测试返回 10000 条可见记录且 listSessions 只调用一次，隐藏项仍过滤；客户端每目录一个 Claude 请求，无 offset；未传 all/传 false 的旧分页仍正确 |

本轮未重复浏览器截图，也未运行真实 Agent 进程回收/恢复端到端测试。并发互斥范围为同一应用页面的选择器；不涵盖独立浏览器页面/其他入口的服务器端幂等保证。一万条记录用模拟扫描结果验证调用次数，未做真实磁盘性能压测。不同工作区独立占用由 store 的 workspaceId 分区实现，本轮为源码检查。
