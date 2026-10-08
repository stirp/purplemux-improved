# Sessions 导航同步侧边栏项目：实施记录

2026-10-07，依据 [需求](../requirements/session-workspace-navigation.md) 和 [规格](../features/session-lifecycle/spec.md)，先补充行为约定再修改代码。

- `src/hooks/use-layout.ts`：统一项目定位逻辑供已有 Tab 导航和同工作区恢复后新建 Tab 使用。切回项目列表、选择实际工作区、隐藏内嵌网页，并展开所属分组。
- 使用现有工作区排序函数确定父子项目实际所属分组；祖先展开沿用激活工作区驱动的导航可见性逻辑。
- 历史查询或创建失败分支不调用定位逻辑；重建成功后使用新工作区 ID。
- `tests/unit/lib/session-workspace-navigation.test.ts`：覆盖跨项目、同项目、其他路由、两类代理复用与恢复、工作区重建，以及失败保留状态。
- 同步 PRD、任务表及会话生命周期 ui/flow/api。

KISS/DRY：两个导航分支复用一个小函数及现有 store 方法；不引入新接口、配置字段或额外持久化机制。定位与会话恢复逻辑保持独立职责。

验证证据见 [验证记录](./verify-session-workspace-navigation.md)。
