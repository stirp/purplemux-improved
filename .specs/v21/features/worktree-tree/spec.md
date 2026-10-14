---
page: worktree-tree
title: 项目 Worktree 关系与同步
status: DETAILED
depends_on:
  - .specs/v20/features/worktree-sync-delivery/spec.md
created: 2026-10-14
updated: 2026-10-14
---

# 项目 Worktree 关系与同步

统一管理入口始终显示，关系视图仅在当前工作区存在子 worktree 时显示。树边以 parentWorkspaceId 为准；Git 对比以两个工作区对应的同一仓库本地分支为准，ahead 为子尚未合并到父的提交，behind 为父尚未同步到子。每条边允许显式确认后将一方 merge 到另一方，执行前复用 worktree 同步校验；异常状态展示错误并可刷新。详情见[需求](../../requirements/worktree-tree.md)。

## 详情与证据

- [界面](./detail/ui.md)、[流程](./detail/flow.md)、[接口](./detail/api.md)
- [实施记录](../../result/build-worktree-tree.md)、[验证记录](../../result/verify-worktree-tree.md)

## 管理视图整合（2026-10-14）

有子节点的根工作区菜单只显示统一管理入口，弹窗提供关系视图和仓库视图；仓库视图复用旧管理实现及其安全校验。无子节点的根及非根工作区进入统一入口的仓库视图，以便接管仓库中尚未建立工作区的 worktree。切换视图保留各自状态；关系视图在仓库操作后刷新。详见[需求](../../requirements/worktree-tree.md)，依赖[生命周期规格](../../../v20/features/worktree-lifecycle/spec.md)与[组织规格](../../../v20/features/worktree-organization/spec.md)。

## 统一交付与提交后操作（2026-10-14）

移除工作区行单独的交付图标；所有工作区使用统一管理入口，关系视图仅在有子工作区时显示，仓库视图始终可用。管理列表保留原有交付入口。AI 提交成功后在提交弹窗继续呈现经身份匹配的工作树交付表单，复用显式推送及草稿确认；提交失败、无受管工作树、无远端时不自动交付。依赖[AI Git 文案与提交规格](../../../v20/features/ai-git-writing/spec.md)。

## 2026-10-14 审查修正

双向操作的目标工作树是 Git merge 的执行目录，另一方本地分支为 merge 参数；用双向界面测试及真实仓库测试确认目标。主工作树默认维持 main blocker，仅对 merge 操作在服务端执行检查中放宽；inspectSync 仍报告 main，rebase、continue、abort 保留原阻断。CLI 沿用相同的 API 操作语义和保护，明确 item 为受修改的工作树。

后续审查验收：父工作区有多个仓库时，以子工作树所属仓库匹配父工作树，正确显示计数并支持双向合并；实际缺失同仓库父工作树仍阻断。合并失败原因和主工作树终端恢复提示须在自动、手动刷新后保留，加载错误独立显示，仅开始下一次合并或关闭弹窗清除旧操作错误。

## 变更面板提交发布快捷入口

Git 面板顶部以文字按钮提供共享提交发布流程，Changes/History 均可用。无未提交改动时可直接发布已有提交，捕获入口时的目录/分支/HEAD 并在交付预览中复核，防止会话切换或并发提交改变发布对象。桌面与移动使用同一组件，窄屏工具栏可换行；确认、错误与提交结果不明的保护沿用原流程。
