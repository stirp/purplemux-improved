---
page: ios-transparent-colors
title: iOS 15.6 半透明颜色与文字可见性修复
status: DETAILED
created: 2026-10-16
updated: 2026-10-16
depends_on:
  - ../../../v20/features/fork-platform/spec.md
  - ../../../v20/features/worktree-lifecycle/spec.md
  - ../../../v21/features/worktree-tree/spec.md
  - ../worktree-inline-merge-confirm/spec.md
---

# iOS 15.6 半透明颜色与文字可见性修复

## 用户原始需求

“在 iPad iOS 15.6 的系统上，删除按钮的文字就显示不出来。检查一下，是不是还有别的文字也有同样的问题，都修复一下。”截图为 Worktree 管理的删除确认区，危险按钮只显示红色矩形。

## 范围与行为

- 补充旧浏览器兼容基线：不支持 `color-mix()` 的 Safari 15.6 中，内置主题的半透明背景不得退化为与前景同色的不透明背景。
- 在公共 CSS 构建链路提供保留透明度的降级，覆盖危险按钮、危险菜单聚焦、工作区状态、Git 文件标签、审批/问题/计划提示等同类用法；同时覆盖浅色、深色及 hover/focus 状态。
- 保留现代浏览器的 `color-mix()` 增强、主题色别名及已有颜色自身的 alpha；不以整个元素 opacity 降低文字可见性，不逐个业务组件打补丁。
- 仅处理内置 CSS 的变量颜色与透明色混合。用户运行时自定义 CSS 中的任意颜色表达式不承诺自动转换；终端运行时颜色变量保留原有降级，避免静态结果覆盖终端主题。
- 沿用 Worktree 基线及就地合并确认增量的操作位置、文字、禁用状态、安全校验与接口；无 Git 操作、数据迁移、发布和权限行为变化。

## 验收标准

1. 开发、生产编译产物中的危险背景 10%/20%/30% 降级保留 alpha，危险文字仍使用完整前景色；浅色和深色变量分别正确。
2. 同色前景与半透明背景的状态、差异标签、审批/计划提示均使用公共降级；hover/focus 与 disabled 仍沿用原交互规则。
3. 语义色别名正常引用对应降级，颜色原有 alpha 与透明度相乘；现代浏览器增强不被覆盖。
4. 保留已有 CSS 嵌套、媒体查询、OKLCH 百分比亮度及前缀兼容检查。
5. 相关自动化、完整 TypeScript、改动文件 ESLint 及构建/浏览器验证完成并记录实际结果；模拟去除 `color-mix()` 支持不等同于 iOS 15.6 实机通过。

见[任务](./task.md)、[实施记录](./result/build.md)和[验证记录](./result/verify.md)。
