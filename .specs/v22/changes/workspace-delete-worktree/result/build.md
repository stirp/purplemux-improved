# 实施记录

## 代码已实现

- `src/components/features/workspace/delete-workspace-dialog.tsx`：共享删除确认，默认保留磁盘文件；从现有总览识别当前项目唯一关联的非主工作树，展示目录、当前分支、关联项目与忽略文件清单。勾选联动删除且确认忽略文件后，调用现有 store 的 `removeWorktree`。
- `src/components/layout/sidebar.tsx`：使用共享确认框，保留普通删除的渐隐与相邻项目选择；仅删除成功后切换项目，失败保留弹窗。
- `src/components/features/mobile/mobile-workspace-actions.tsx`：复用同一确认与操作流程，移除重复删除代码。
- `messages/*/sidebar.json`：11 种现有语言同步增加六条提示。
- `tests/unit/lib/delete-workspace-dialog.test.ts`：覆盖默认行为、目标识别、阻断、忽略文件确认、服务端拒绝、刷新/重开、部分成功、取消及执行中保护。

## 实现边界与原则

- KISS/DRY：只增加共享确认组件，复用总览、忽略文件提示、store 与已有安全删除接口；不新增 API 或重复 Git 删除逻辑。
- 单一职责：共享组件负责确认及操作选择；服务端保留状态复核与实际磁盘清理职责。
- YAGNI：不增加默认自动清理、分支删除、批量目标删除或后台清理任务。普通删除 API 与旧配置不变；外部接入项目通过关联关系识别，无需迁移元数据。
- 数据安全：发送确认时的 HEAD、分支和忽略文件快照，固定 `deleteBranch=false`、`closeIdleSessions=true`；失败不会自动调用普通项目删除作为降级。
- 部分成功沿用现有接口语义：磁盘删除成功后项目清理失败会给出警告，保留未清理项目，用户可后续单独移除项目。

规格在编码前创建；验证结论见 [验证记录](./verify.md)。
