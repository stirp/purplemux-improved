# 验证记录

日期：2026-10-17。下列结果来自当前任务的实际运行。

## 自动化检查

- 修正测试事件目标后、修复源码前，UI 测试 7 项通过、5 项失败：Escape 仍保持 `aria-pressed=true`，编辑/新增未禁用，方向键排序和失败重试未发出 PUT。复现两条审查问题及方向键传播问题。
- 修复后运行 `pnpm exec vitest run tests/unit/lib/terminal-commands-ui.test.ts tests/unit/api/terminal-commands.test.ts tests/unit/lib/terminal-commands-storage.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/workspace-reorder.test.ts`：79 项通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec eslint src/components/features/workspace/terminal-commands-bar.tsx src/hooks/use-terminal-commands.ts src/lib/workspace-store.ts src/pages/api/terminal-commands.ts tests/unit/lib/terminal-commands-ui.test.ts tests/unit/lib/terminal-commands-storage.test.ts tests/unit/api/terminal-commands.test.ts`：通过。
- `git diff --check`：通过。11 个语言 JSON 解析及新增键检查通过。

## 验收映射

| 条款 | 证据与结果 |
| --- | --- |
| 1 手柄、桌面/移动及键盘 | Chromium 桌面鼠标拖动通过；390px 手机尺寸通过 CDP `Input.dispatchTouchEvent` 将第三项拖到首位；页面 scrollWidth=390、弹窗宽 358。修正后从实际手柄发送 Space → ArrowDown → Space，列表/API 顺序一致。 |
| 2 同步与持久化 | 管理列表、按钮栏、GET 返回顺序一致，刷新后保留；存储测试重读文件并覆盖排序后的增删改。 |
| 3 取消与操作互斥 | 修正后浏览器手柄启动拖动时 `aria-pressed=true`、编辑/新增禁用；ArrowDown → Escape 后 pressed 清除、弹窗保留且编辑恢复，进入编辑后 Close 成功关闭。UI 测试覆盖从聚焦手柄取消、原位放下不保存，排序不发送终端输入。 |
| 4 失败与禁用 | UI 测试覆盖失败保留顺序、重试成功、保存期间禁用、读取失败及单条命令禁用排序。 |
| 5 校验、并发与写入失败 | API/存储测试覆盖非法/重复/超量 ID、409/500、并发内容编辑、工作区字段保留、过期集合拒绝、磁盘失败不写入或广播。 |
| 6 共用与兼容 | 桌面/移动使用相同组件，未新增配置字段；旧配置及工作区回归测试通过。沿用现有同步机制，未单独运行跨客户端广播或断线重连浏览器测试。 |

## 浏览器环境与证据

- agent-browser 独立会话 `terminal-command-sorting`，开发实例 `http://127.0.0.1:18168`，数据及 tmux socket 位于 `/tmp/pmux-command-sorting-pgb6or3w`，未改用户真实配置。
- 初次初始化出现基线已有的 sessionWorkflow SSR 序列化问题，调用已有工作区 GET 初始化后正常加载。审查修正时重启了无响应的隔离开发进程后继续验证。
- [桌面](./desktop.png)、[手机尺寸](./mobile.png)。手机截图为修正后的键盘排序结果；原生触摸事件测试在审查修正前完成，修正后未再次执行触摸拖动。
- 原先仅观察“Escape 后弹窗保留”不足以证明取消成功；本次增加手柄 `aria-pressed` 清除、恢复编辑和关闭的检查，纠正此前验证缺口。

## 限制

- 已完成实现、自动化检查及 Chromium 桌面/手机尺寸验证；未执行生产构建或手机实机测试。
- 未提交、推送或发布。
