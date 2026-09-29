# 移动端工作区操作、Tab 改名与触摸拖拽：接口与数据

## 接口或内部通道

- 复用 workspace/layout store 和既有 Worktree API。
- use-navigation-drag、use-touch-drag 统一拖拽状态与手势处理。

## 数据与执行边界

- 拖拽不能误开菜单，菜单不能吞掉正常点击。
- 桌面鼠标交互与触摸设备行为必须同时保留。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
