# 工作区目录选择、布局与层级管理：使用流程

## 基本流程

1. 浏览目录并选择一个或多个目录，创建工作区。
2. 在工作区中打开或改名 Tab，调整工作区或分组顺序。
3. 切换激活工作区，按祖先关系更新可见子项；刷新后恢复持久化布局。

## 异常与约束

- 目录不可读、不存在或非绝对路径时返回对应错误。
- 隐藏子工作区只影响导航可见性，不删除工作区、磁盘目录或分支。

具体实现与测试入口见[规格](../spec.md)。

## 2026-10-13 工作状态管理

遵循[Sessions 与 Workspace 工作状态需求](../../../requirements/session-task-status.md)。人工状态与运行状态分离，分类折叠及 Workspace 汇总共享同一状态规则。状态和折叠偏好保存于 workspaces.json 的 sessionWorkflow，GET /api/workspace 读取，PATCH /api/session-workflow 严格校验并按字段更新，通过 workspace 广播同步。
