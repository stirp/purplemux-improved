# Session 状态管理第二轮 Review 验证

日期：2026-10-13。对应[状态管理需求](../requirements/session-task-status.md)中的第二轮 Review 修复约定。

## 验收映射

| 问题 | 回归验证 |
| --- | --- |
| inactive Tab 重建已删除索引 | 删除标记持久化后再次同步原 Tab；索引、人工状态和客户端列表均不包含删除会话；随后关闭 Tab 也不恢复 |
| 迟到历史快照复活会话 | 使用删除前捕获的快照并发回补，覆盖回补先入锁及删除先完成两个顺序；磁盘重读均保持删除 |
| 旧删除标记兼容 | 回补读取真实 hidden-sessions 文件，排除目标原生身份，并保留同 ID 的其他 provider |
| 无原生 ID 的历史删除 | 持久删除键按历史 ID 隔离，旧历史快照不会再次建立索引 |
| 无轮次 A/B 共用 Tab | 无历史条目时保存两会话的原生身份及 Workspace 元数据；B 当前激活时点击 A 调用 A 的恢复目标，删除 A 不移除 B |
| 关闭 Tab 后恢复和删除 | 从独立索引读取 navigation，使用原生 ID 和目录恢复；保留同一历史删除组件入口 |
| 旧无轮次索引升级 | 从已保存的 provider/session key 及仍存在的 Workspace 回补导航目标，不伪造历史轮次 |

## 本次检查

- 定向 5 文件 54 项测试通过，随后增加的无轮次界面回归单独复跑 7 项通过。
- 最终 `pnpm exec vitest run --maxWorkers=2`：919 项通过、0 项失败、1 项跳过，包含全部新增回归。
- 完整 `pnpm tsc --noEmit` 通过。
- 全部改动源码及测试 ESLint 通过，无警告。
- `git diff --check` 通过。
- `pnpm build` 通过：Next.js 完整类型检查、生产编译、24 个页面生成及服务端 tsup 构建均成功。

## 命令

```bash
pnpm exec vitest run --maxWorkers=2
pnpm tsc --noEmit
pnpm exec eslint "src/types/session-history.ts" "src/lib/session-workflow.ts" "src/lib/workspace-store.ts" "src/hooks/use-session-workflow.ts" "src/hooks/use-session-navigation.ts" "src/components/features/workspace/notification-sheet.tsx" "tests/unit/lib/session-workflow-storage.test.ts" "tests/unit/lib/session-workflow-ui.test.ts"
pnpm build
git diff --check
```

## 限制

未执行真实浏览器、CLI 和多客户端断网验收；界面测试基于 jsdom，存储与并发顺序测试使用受控文件系统。旧索引所属 Workspace 已不存在且从未保存目录时，无法猜测原目录。
