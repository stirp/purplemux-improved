# Sessions 导航同步侧边栏项目：实施记录

2026-10-08 复审修正，依据 [需求](../requirements/session-workspace-navigation.md) 和 [规格](../features/session-lifecycle/spec.md)，先补充行为约定再修改代码。

- `src/hooks/use-session-navigation.ts`：仅 Sessions 历史入口使用的编排；等待工作区加载、验证服务端布局，再进入会话并设置临时项目定位状态。
- `src/hooks/use-layout.ts`：恢复通用导航原行为。历史恢复新增显式回调及无代理 ID 时要求已有 Tab 的选项，默认调用方行为不变。
- `src/hooks/use-sidebar-actions.ts`：抽出共享选择函数，优先复用桌面/移动端注册处理器，保留上一工作区记账与元数据重置；未挂载处理器时沿用工作区 store 的切换。
- `src/components/features/workspace/notification-sheet.tsx`：历史项接入专用入口；普通通知保持通用入口。
- `src/components/layout/sidebar.tsx`：目标分组按临时状态显示展开，保存的 collapsed 不变。离开目标或手动收起时取消临时显示；不增加分组磁盘写入和同步回声。
- 定位分组只按 ID 索引遍历祖先，不运行完整工作区排序。
- `tests/unit/lib/session-workspace-navigation.test.ts`：保存并恢复所有相关 store 的完整快照，通过公共 setWorkspaceId 重置 fetch 抑制状态；不使用 spyOn 修改活 store。新 Tab 场景使用真实 fetchLayout，重建场景验证实际目标 ID、分组及保存偏好。
- 同步 PRD、任务表、spec 的实现与测试索引及 ui/flow/api。

KISS/DRY：复用原会话恢复及项目选择处理器，将定位副作用限制在一个专用入口。分组展开是临时显示状态，不新建配置字段或持久化机制。

2026-10-07 初版将 reveal 接在通用导航且永久展开分组，已被此次实现替代；初版测试隔离存在缺陷，不能作为最终行为的验收证据。

验证证据见 [验证记录](./verify-session-workspace-navigation.md)。
