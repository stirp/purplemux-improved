# Sessions 与 Workspace 工作状态验证

日期：2026-10-13。对应[需求](../requirements/session-task-status.md)。

## 本次结果

- 7 个测试文件共 49 项通过：session-workflow、session-workflow-api、session-workflow-storage、session-workflow-ui、workspace-group-order、session-workspace-navigation、workspace-delete。
- 自动规则、人工覆盖多轮持续生效、同 ID 不同 provider 隔离、去重和历史兼容由 session-workflow 测试覆盖。
- Workspace 汇总覆盖无会话、未开始、审批中、进行中和全部完成。
- API 验证非法状态、标识、字段混用、方法及失败响应。
- 存储验证并发更新不丢失、保留原有 Workspace 字段、折叠持久化、恢复自动及磁盘失败重试。
- jsdom 界面测试验证人工状态切换、恢复自动、折叠/展开、计数和保存失败后保持原值；不等同于浏览器实机验收。
- `pnpm tsc --noEmit` 完整类型检查通过；全部改动源码及新增测试 ESLint 通过，无警告。
- 最终 `pnpm build` 通过：Next.js 类型检查、生产编译、24 个页面生成及自定义服务端 tsup 构建均成功。
- `git diff --check` 通过。

## 命令

```bash
pnpm exec vitest run tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/session-workflow.test.ts tests/unit/lib/session-workflow-api.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/workspace-group-order.test.ts tests/unit/lib/session-workspace-navigation.test.ts tests/unit/lib/workspace-delete.test.ts
pnpm tsc --noEmit
pnpm exec eslint src/lib/session-workflow.ts src/lib/workspace-store.ts src/types/terminal.ts src/hooks/use-workspace-store.ts src/hooks/use-session-workflow.ts src/pages/api/session-workflow.ts src/components/features/workspace/notification-sheet.tsx src/components/features/workspace/workspace-status-indicator.tsx tests/unit/lib/session-workflow.test.ts tests/unit/lib/session-workflow-api.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/session-workflow-ui.test.ts
pnpm build
git diff --check
```

## 未完成验收

桌面/移动端实机、真实 WebSocket 重连及跨客户端联动尚未执行；持久化、共享 UI 和现有同步通道的源码/自动测试检查不替代这些验收。

## 后续 Review 修复

身份导航、首次绑定迁移、重连及历史裁剪后的会话关联保留，见[独立验证记录](./verify-session-task-status-review.md)。上述初始 49 项检查不作为后续修复的运行证据。
