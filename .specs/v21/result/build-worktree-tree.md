# Worktree 关系与同步实施记录

2026-10-14 后续审查修正：WorktreeTreeDialog 先定位子工作树仓库，在同一仓库内匹配父工作树，避免父工作区含多个仓库时错配首个仓库。加载错误与合并错误分别保存，刷新只更新加载错误；主工作树冲突输出及终端恢复提示在刷新后保留，下一次执行合并清除旧操作错误。移除成功路径重复的刷新调用，由 finally 统一刷新。沿用现有接口与 CLI，无新增协议。

2026-10-14：桌面和移动根工作区新增有子节点时可见的关系入口；工作区行显示父名称；关系弹窗按工作区树展示本地分支双向提交差异，并复用现有 inspectSync / merge 的快照校验、阻断及冲突恢复流程。主工作树仅在同步流程中免除清理专用的 main 阻断；删除保护保持原状。改动入口：worktree-tree-dialog.tsx、workspace-item.tsx、mobile-workspace-actions.tsx、mobile-navigation-sheet.tsx、worktree-sync.ts。非中文语言暂使用英文文案。

同日增量：将旧的 ManageWorktreesDialog 列表与操作嵌入统一弹窗仓库视图，根节点在有子节点时入口合一。未建立子节点的根及其他工作区继续使用原弹窗；切换视图保留仓库表单状态，仓库变更触发关系刷新。

同日交付入口调整：删除工作区行独立同步交付按钮及旧按钮组件；所有工作区菜单统一进入 Worktree 管理，有子节点时显示关系 tab，无子节点时直接显示仓库列表。AI 提交成功后通过会话工作区与提交目录定位对应工作树，在原弹窗嵌入现有 WorktreeDraftForm；推送及草稿仍使用独立确认。

审查修正：复核执行方向后将合并请求中的变量明确命名为 destination（被修改的 item）与 incoming（合入的 targetRef）。恢复逻辑在主工作树冲突时提示在终端处理，其他 worktree 继续走交付弹窗。同步 blocker 仅在 merge 执行流程中过滤 main，其余动作保持阻断。CLI 无需新增参数或命令；更新离线帮助和中英文 CLI 参考，说明 item 为修改目标及 main 保护边界。

变更面板快捷入口：DiffPanel 的图标入口替换为“提交与发布”文字按钮，Changes/History 均可进入；窄屏工具栏换行。GitCommitDialog 复用同一提交和 WorktreeDraftForm 发布流程，初始 noChanges 可直接发布已有提交；提交状态不明时仍阻断。新增 ICommitRepository 固定入口快照，GitCommitDelivery 在 overview 与 inspectSync 后验证分支和 HEAD，避免发布对象变化。更新 11 种语言文案；未增加服务端接口或 CLI 参数。
