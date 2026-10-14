---
page: session-search
title: Sessions 查询
status: DETAILED
created: 2026-10-15
updated: 2026-10-15
depends_on:
  - ../../../v20/features/session-lifecycle/spec.md
  - ../agent-session-titles-spec.md
---

# Sessions 查询

遵循[用户需求](../../requirements/session-search.md)，在共用 NotificationPanel 中为活动与历史会话提供即时文本查询。

## 验收标准

1. 可通过当前显示标题（包括覆盖标题）、工作区名称/路径、原生会话 ID、活动用户消息、保留历史轮次的 prompt/result 查询；Claude/Codex、无原生 ID 和无轮次索引均兼容。
2. 大小写不敏感，首尾空白忽略，空白查询返回全部会话；不使用正则表达式或隐式多词语法。
3. 分组与总数按会话计算，较早轮次命中不重复计数；已删除身份不重新出现。
4. 非空查询临时展开匹配分类，仅展示命中的较早轮次（含结果摘要），清空后恢复原分类偏好与较早轮次展开状态；搜索不写折叠配置。
5. 无匹配提示和没有会话提示区分；清空按钮与 Escape 可用，Escape 清空搜索时不关闭移动抽屉，输入框具有无障碍名称。
6. 同步更新、状态编辑及删除后仍按关键词显示；导航沿用原会话身份判断，不改变 Workspace 汇总。
7. 桌面和 320px 窄屏入口一致，搜索栏保持可见，列表内部滚动；相关测试、完整 TypeScript、改动文件 ESLint 通过，浏览器验收及限制单独记录。
8. 每条活动会话、历史会话、无轮次索引和更早记录均显示独立项目名称行；当前非空工作区名称优先，空白名称不能遮断回退。缺失时依次采用同一会话已保留的名称、目录末段、工作区 ID，均缺失显示“未知项目”。长名称可换行，不被时间或标题挤掉；重命名后展示与搜索同步。

## 详情

- [界面](./detail/ui.md)
- [流程](./detail/flow.md)
- [数据](./detail/api.md)
- [实施记录](../../result/build-session-search.md)
- [验证记录](../../result/verify-session-search.md)
