# 历史会话删除与工作区会话清理：界面与交互

## 入口与展示

仅 Sessions 历史项成功进入会话后，切换侧边栏至项目列表，高亮实际目标工作区，临时展开其所在分组。保存的折叠偏好不变；离开目标或手动收起后恢复偏好。子工作区使用现有激活路径显示祖先；移动端保留关闭导航抽屉的行为，不强制打开导航。普通通知与移动端 Tab 导航不触发上述项目定位。

会话操作提供删除确认框和永久删除提示；工作区删除检查关联 Tab 与会话状态。

## 交互验收

- 首次及再次打开确认框都恢复预期默认值，取消勾选仅移除历史。
- 活动会话删除受阻，空闲工作区清理不残留错误会话关联。

## 异常与边界

- 正在使用的原始会话受服务端保护。
- 默认勾选是已确认的产品决策，不能描述成默认只隐藏或要求先手动勾选。
- 会话记录清理不等于磁盘 Worktree 清理。

本次记录现有交互；未实际运行浏览器验证。功能范围及源码入口见[规格](../spec.md)。

## 2026-10-13 工作状态管理

遵循[Sessions 与 Workspace 工作状态需求](../../../requirements/session-task-status.md)。人工状态与运行状态分离，分类折叠及 Workspace 汇总共享同一状态规则。状态和折叠偏好保存于 workspaces.json 的 sessionWorkflow，GET /api/workspace 读取，PATCH /api/session-workflow 严格校验并按字段更新，通过 workspace 广播同步。

Review 修复：sessionWorkflow 增加 sessions 持久索引和 tabBindings 首次绑定记录；GET Workspace 回补当前 Tab/保留历史并迁移 fallback，历史新增在裁剪前更新索引，显式删除同步清除索引。同步连接 onopen 补拉 Workspace，历史禁用导航按会话身份判断。完整约束见上链需求的 Review 修复约定。

第二轮 Review：删除标记 sessionWorkflow.deleted 在写锁内持久化，并在回补中读取 hidden-sessions；无轮次索引单独保存 navigation 恢复目标，按原生身份导航、判断当前会话和提供删除入口。详见状态管理需求第二轮约定。

第三轮 Review：删除身份仍消费首次绑定 fallback 并记录绑定，不迁移人工状态；无轮次会话使用 DOM 菜单触发器，验收右键和长按。详见状态管理需求第三轮约定。
