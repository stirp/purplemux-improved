# Session 工作状态第三轮 Review 验证

日期：2026-10-13。对应[状态管理需求](../requirements/session-task-status.md)第三轮 Review 修复约定；实施见[实施记录](./build-session-task-status.md)。

## 验收映射

| 问题 | 本轮回归 |
| --- | --- |
| 删除身份首次绑定保留 fallback | 纯函数及持久存储验证：首次绑定已删除 A 消费 fallback 状态/索引并记录绑定，不迁移人工状态；关闭后无残留；同 Tab 的 B 为未开始 |
| 旧隐藏标记兼容 | 从受控 hidden-sessions 文件读取已隐藏 A，执行首次绑定、关闭及 B 绑定，同样无状态泄漏 |
| 客户端即时派生 | 尚未同步绑定时，deleted A 与 fallback 均不出现在客户端派生列表 |
| 无轮次行右键菜单 | 渲染真实 NotificationPanel、SessionHistoryActions 和 Base UI ContextMenu，右键打开删除项并可进入确认框，不触发导航 |
| 移动长按与取消 | 真实菜单组件响应 500ms 长按；提前结束和移动超过阈值取消菜单，不触发导航 |
| 左键身份导航 | DOM 触发器内左键仍恢复原生 A 身份和工作区目录 |

## 本次结果

- 定向 4 文件 35 项通过。
- 全量 `pnpm exec vitest run --maxWorkers=2`：927 项通过、0 项失败、1 项跳过。
- `pnpm tsc --noEmit` 通过。
- 改动源码与测试 ESLint 通过。
- `git diff --check` 通过。
- `pnpm build` 通过：Next.js 完整类型检查、生产编译、24 个页面生成及服务端 tsup 构建成功。

## 检查命令

```bash
pnpm exec vitest run "tests/unit/lib/session-workflow.test.ts" "tests/unit/lib/session-workflow-storage.test.ts" "tests/unit/lib/session-workflow-menu.test.ts" "tests/unit/lib/session-workflow-ui.test.ts" --maxWorkers=2
pnpm exec vitest run --maxWorkers=2
pnpm tsc --noEmit
pnpm exec eslint "src/lib/session-workflow.ts" "src/components/features/workspace/notification-sheet.tsx" "tests/unit/lib/session-workflow.test.ts" "tests/unit/lib/session-workflow-storage.test.ts" "tests/unit/lib/session-workflow-menu.test.ts"
pnpm build
git diff --check
```

## 限制

菜单验证使用 jsdom 与真实组件，移动端以触摸事件和定时器模拟；存储验证使用受控文件系统。未执行真实浏览器、手机、CLI 或多客户端实机验收。本轮结果独立于之前两轮检查。
