# 实施记录

本需求先补充独立规格，再实现代码；没有修改历史功能规格或版本汇总。

## 变更入口

- `src/lib/scheduled-tasks.ts`：共享输入校验、类型与时区日历计算。
- `src/lib/workspace-store.ts`、`src/types/terminal.ts`：可选 scheduledTasks 字段，复用共享文件锁、原子写入、广播和旧文件兼容。
- `src/lib/scheduled-task-service.ts`：按工作区隔离的创建、修改、启停和删除。
- `src/lib/scheduled-task-scheduler.ts`：globalThis 单例，原子认领、每 15 秒调度、重启恢复、防重入、并发上限及记录裁剪。
- `src/lib/scheduled-task-runner.ts`、`src/lib/scheduled-task-supervisor.ts`：独立非交互执行、stdin 提示词、环境配置复用、输出上限、超时与 IPC 断开清理。
- `server.ts`：服务初始化后启动调度；关闭时先停止任务，再释放实例锁。
- `src/pages/api/scheduled-tasks.ts`：管理和执行 API。
- `src/components/features/workspace/scheduled-tasks-dialog.tsx`：列表、表单、操作和执行记录；桌面 workspace-item 与移动 mobile-workspace-actions 共用。
- `messages/*/workspace.json`：定时任务文案。
- `tests/unit/lib/scheduled-*.test.ts`、`tests/unit/api/scheduled-tasks.test.ts`：日历、持久化、调度、真实进程、API 和交互回归；既有工作区菜单测试增加新入口。

## 设计约束

- KISS/YAGNI：只实现单次、每日、每周及当前两类执行需求，不新增依赖或分布式调度设施。
- DRY：复用工作区存储、Agent 环境、shell 配置、认证和界面组件，桌面/移动端共用实现。
- 单一职责：日历/校验、管理服务、调度器、进程执行和 UI 分离；调度器可注入执行器验证并发和失败行为。
- 全部数据写入均以成功持久化为前提，运行认领失败不会启动进程。任务输出只按文本呈现。

## Review 修复（2026-10-19）

本轮先更新同需求规格，再新增回归测试及修复三个边界问题。

- `scheduled-tasks.ts`：搜索包含当天及随后 14 天，覆盖下周时刻因夏令时缺失时的再下一周。保持现有日历算法，避免增加依赖。
- `scheduled-task-scheduler.ts`：按执行 ID 保存待持久化结果及实际结束时间；完成、调度、手动执行、再次启动和正常停止时重试写入，原子写入成功后才移除待保存结果。按执行 ID 管理活动进程，避免旧执行收尾误删新执行的跟踪项。关闭时仅作有限重试。
- `workspace-store.ts`：复用单一孤立任务清理函数，覆盖工作区写入及任务修改前的额度判断；未运行任务清理，运行中任务暂停并保留，结果保存后清理。沿用共享锁、原子写入及旧配置兼容，不引入额外存储或调度器依赖。
- 回归覆盖纽约跨缺失周的创建/启用/执行推进、连续写入失败后恢复、四条待保存结果与并发启动、关闭重试、历史孤立任务、真实工作区删除及删除失败。

## PR #69 列表查询修复

审查意见：[不存在工作区的列表查询应返回 404](https://github.com/stirp/purplemux-improved/pull/69#discussion_r4315706169)，对应审查提交 `5d148e39dfc3d83c54f56f0bdf49cb6bf43fb764`。

- `workspace-store.ts` 新增只读的 `readWorkspaceScheduledTasks`：复用严格文件读取，从同一快照判断工作区是否存在并筛选其任务，避免两次读取产生不同快照；不存在返回 null，有效空工作区返回空数组，读取错误继续抛出。
- `scheduled-task-service.ts` 将不存在工作区转换为现有 `notFound` / 404 错误，由既有 API 统一返回；不引入写入、清理或额外锁，保持存储与接口错误映射职责分离。
- 测试直接组合现有 API handler、service 与 workspace-store，使用内存文件系统模拟旧配置、未知/已删除工作区、保留运行记录的孤立工作区、读取失败与 JSON 损坏；修正旧测试将不存在工作区误视为有效空工作区的假设。
