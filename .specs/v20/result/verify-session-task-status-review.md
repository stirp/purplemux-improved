# Session 状态管理 Review 修复验证

日期：2026-10-13。对应[需求](../requirements/session-task-status.md)中的 Review 修复约定。

## 验收映射

| 问题 | 本次验证 |
| --- | --- |
| Tab 复用误禁用旧会话导航 | jsdom 使用真实当前 Pane 结构，确认 A 的 Tab 切换到 B 后 A 仍可恢复；同 provider/session ID 才禁用导航 |
| 首次绑定丢失人工状态 | 纯函数及磁盘存储验证 fallback 被消费、原生人工选择优先、下一会话不继承、重复同步不把未开始误判为审批中 |
| 重连不补拉 Workspace | 模拟断开与定时重连，使用真实 Workspace store 接收新的人工状态及折叠偏好；不触发可见性变化、不等待 Workspace 广播 |
| 历史裁剪丢失关联 | 实际写入第 201 条记录后确认旧轮次被裁剪；从磁盘重读独立索引，所属 Workspace 仍完成且保留导航摘要；显式删除不会复活 |

## 检查结果

- 11 个相关测试文件共 71 项通过。重连测试随后加强为真实客户端 store，单独复跑通过。
- 完整 `pnpm tsc --noEmit` 通过。
- 全部改动源码和测试 ESLint 通过，无警告。
- `pnpm build` 通过，包括 Next.js 类型检查、24 个页面生成以及 tsup 服务端构建。产物包含修复后的状态推导。
- `git diff --check` 通过。
- 全量 Vitest 与构建并行运行时：910 项通过、1 项终端 64 MiB 压力测试失败、1 项跳过；该终端测试文件单独复跑 8 项全部通过。
- 最终 `pnpm exec vitest run --maxWorkers=2`：911 项通过、0 项失败、1 项跳过。

## 命令

```bash
pnpm exec vitest run tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/session-workflow.test.ts tests/unit/lib/session-workflow-reconnect.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/session-workflow-api.test.ts tests/unit/lib/config-sync-hook.test.ts tests/unit/lib/session-workspace-navigation.test.ts tests/unit/lib/workspace-sessions.test.ts tests/unit/lib/workspace-delete.test.ts tests/unit/lib/session-history-api.test.ts tests/unit/lib/session-history-removal.test.ts
pnpm exec vitest run
pnpm exec vitest run tests/unit/lib/terminal-write-queue.test.ts
pnpm exec vitest run --maxWorkers=2
pnpm tsc --noEmit
pnpm exec eslint src/lib/session-workflow.ts src/lib/session-history.ts src/lib/status-manager.ts src/lib/workspace-store.ts src/hooks/use-sync.ts src/pages/api/workspace/index.ts src/pages/api/session-history.ts src/components/features/workspace/notification-sheet.tsx tests/unit/lib/session-history-api.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/session-workflow.test.ts tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/session-workflow-reconnect.test.ts
pnpm build
git diff --check
```

## 限制

未执行浏览器/实机和真实多客户端断网验收；jsdom、模拟 WebSocket 和实际文件存储回归不替代实机验证。旧数据中已被裁剪且从未建立索引的关联无法凭状态键回补，不猜测所属 Workspace。
