# 工作区目录选择、布局与层级管理：界面与交互

## 入口与展示

桌面侧栏、新建工作区弹窗和 Tab 菜单展示目录、名称、分组及父子层级。

## 交互验收

- 多目录选择、空工作区恢复和 Tab 改名正确。
- 父子层级在分组排序后保持一致；循环和孤儿数据仍可访问。

## 异常与边界

- 目录不可读、不存在或非绝对路径时返回对应错误。
- 隐藏子工作区只影响导航可见性，不删除工作区、磁盘目录或分支。

本次记录现有交互；未实际运行浏览器验证。功能范围及源码入口见[规格](../spec.md)。

## 2026-10-13 工作状态管理

遵循[Sessions 与 Workspace 工作状态需求](../../../requirements/session-task-status.md)。人工状态与运行状态分离，分类折叠及 Workspace 汇总共享同一状态规则。状态和折叠偏好保存于 workspaces.json 的 sessionWorkflow，GET /api/workspace 读取，PATCH /api/session-workflow 严格校验并按字段更新，通过 workspace 广播同步。
