# Fork 提交覆盖表

基线 `52140216`，截止 `3637a357012b7f27331b65cf793061c9af8e11d8`。使用 `git log --no-merges --reverse` 枚举 48 个提交；每项至少归属一个功能，合并提交不重复列出。标题为 update 的提交也按实际文件差异归类。

| 提交 | 原始标题 | 对应功能 |
| --- | --- | --- |
| `58cd8488` | feat: rename fork to purplemux-improved and improve workspace workflows | [工作区目录选择、布局与层级管理](../features/workspace-management/spec.md)、[Claude/Codex 交互式问题卡片](../features/interactive-questions/spec.md)、[附件草稿与上传访问保护](../features/attachments/spec.md)、[Fork 标识、旧浏览器兼容与开发配置](../features/fork-platform/spec.md)、[Agent 启动与代理环境继承](../features/agent-runtime/spec.md) |
| `6155e1b1` | feat: add session management, queued input and workspace customization | [工作区目录选择、布局与层级管理](../features/workspace-management/spec.md)、[排队输入、立即提交与长文本粘贴](../features/queued-input/spec.md)、[历史会话删除与工作区会话清理](../features/session-lifecycle/spec.md) |
| `08d4233e` | fix: submit Codex question answers immediately and preserve selections | [排队输入、立即提交与长文本粘贴](../features/queued-input/spec.md)、[Claude/Codex 交互式问题卡片](../features/interactive-questions/spec.md) |
| `a9d601df` | update | [工作区目录选择、布局与层级管理](../features/workspace-management/spec.md)、[Worktree 创建、接入与安全删除](../features/worktree-lifecycle/spec.md)、[Agent 状态栏与 Todo/Plan 进度](../features/agent-progress/spec.md)、[Web 输入联动 CLI 原生命令菜单](../features/native-commands/spec.md)、[浏览器存储清理、翻译刷新与异常恢复](../features/browser-recovery/spec.md) |
| `88367f86` | feat: unify agent progress UI and configure Codex environment | [Claude/Codex 交互式问题卡片](../features/interactive-questions/spec.md)、[Agent 状态栏与 Todo/Plan 进度](../features/agent-progress/spec.md)、[Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `790e555b` | update | [工作区目录选择、布局与层级管理](../features/workspace-management/spec.md) |
| `9e14f341` | update | [Worktree 创建、接入与安全删除](../features/worktree-lifecycle/spec.md) |
| `636024b3` | Refine install websocket hook and add claude preflight tests | [Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `e1e2ee05` | update | [编辑器文件跳转与差异浏览体验](../features/editor-diff-navigation/spec.md) |
| `070bf519` | perf: load timeline history one conversation turn at a time | [按轮加载历史与长消息展开](../features/timeline-history/spec.md) |
| `196101d8` | feat: add worktree overview, adoption and safe cleanup | [Worktree 创建、接入与安全删除](../features/worktree-lifecycle/spec.md) |
| `4d76c174` | feat: add worktree organization, sync and draft PR delivery | [Worktree 检索、空间统计与批量清理](../features/worktree-organization/spec.md)、[Worktree 同步与 PR/MR 草稿交付](../features/worktree-sync-delivery/spec.md) |
| `281dc477` | Fix mobile terminal viewport and controls | [终端流控与移动端视口](../features/terminal-rendering/spec.md) |
| `3060dd9a` | feat: confirm ignored files before worktree removal | [Worktree 创建、接入与安全删除](../features/worktree-lifecycle/spec.md)、[Worktree 检索、空间统计与批量清理](../features/worktree-organization/spec.md) |
| `7eb23e54` | feat: add browser storage cleanup and fresh translation loading | [浏览器存储清理、翻译刷新与异常恢复](../features/browser-recovery/spec.md) |
| `9c20a09f` | feat(mobile): add inline workspace actions and child-worktree indicators | [移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `de6461f8` | feat(mobile): wrap workspace row and add context-menu support | [移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `b5cce4f5` | feat(mobile): add tab rename dialog and harden renameTabInPane return value | [移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `4c18f343` | feat(mobile): support long-press drag on tabs and workspaces | [移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `56637049` | feat(mobile): let touch drag and context-menu coexist on tabs and workspaces | [移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `40121e7f` | feat(mobile): unify tab/workspace drag across desktop and mobile | [移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `43ef0357` | feat(app): wrap app in recovery boundary and extract settings button | [浏览器存储清理、翻译刷新与异常恢复](../features/browser-recovery/spec.md) |
| `11423ec7` | fix(input): surface backend queue errors instead of generic message | [排队输入、立即提交与长文本粘贴](../features/queued-input/spec.md) |
| `443d7c0b` | fix(status-manager): resolve 'unknown' state on startup and align client gating | [Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `bdc766a6` | add keybinding | [编辑器文件跳转与差异浏览体验](../features/editor-diff-navigation/spec.md)、[Fork 标识、旧浏览器兼容与开发配置](../features/fork-platform/spec.md) |
| `4a7cc7ac` | update | [Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `aa1899a1` | add connecting fix on reviewing | [排队输入、立即提交与长文本粘贴](../features/queued-input/spec.md)、[Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `554ff421` | feat: delete workspaces with idle tabs and associated agent sessions | [Worktree 创建、接入与安全删除](../features/worktree-lifecycle/spec.md)、[历史会话删除与工作区会话清理](../features/session-lifecycle/spec.md) |
| `d73da852` | feat(worktree): add configurable tool-free branch name generation | [AI 分支名生成与分支快速筛选](../features/ai-branch-naming/spec.md) |
| `4b42f164` | fix: preserve Codex root session binding during review | [Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `e5fdb3c9` | 支持分支的快速筛选 | [AI 分支名生成与分支快速筛选](../features/ai-branch-naming/spec.md) |
| `342c2283` | support upload | [AI 分支名生成与分支快速筛选](../features/ai-branch-naming/spec.md) |
| `5cec20aa` | support auto hide child workspace | [工作区目录选择、布局与层级管理](../features/workspace-management/spec.md) |
| `9b525d26` | support ai update message | [Worktree 同步与 PR/MR 草稿交付](../features/worktree-sync-delivery/spec.md)、[AI 提交信息、PR/MR 文案与提交确认](../features/ai-git-writing/spec.md) |
| `2a5ee2bd` | add commit | [AI 提交信息、PR/MR 文案与提交确认](../features/ai-git-writing/spec.md)、[Web 输入联动 CLI 原生命令菜单](../features/native-commands/spec.md) |
| `99a361a2` | chore: 代码评审综合优化（AI 提交、差异视图、上传鉴权等） | [AI 提交信息、PR/MR 文案与提交确认](../features/ai-git-writing/spec.md)、[编辑器文件跳转与差异浏览体验](../features/editor-diff-navigation/spec.md)、[附件草稿与上传访问保护](../features/attachments/spec.md) |
| `b76046b8` | 支持ios 15.6 | [Fork 标识、旧浏览器兼容与开发配置](../features/fork-platform/spec.md) |
| `6fd119f2` | 修复 Safari <16.4 的兼容性问题（Markdown 自动链接、CSS 输出、移动端工作区展开） | [Fork 标识、旧浏览器兼容与开发配置](../features/fork-platform/spec.md) |
| `b1e482e7` | feat(terminal): 引入浏览器解析端流控，防止 PTY 输出过快导致丢帧 | [终端流控与移动端视口](../features/terminal-rendering/spec.md) |
| `d1f8b449` | 启动codex不再检测升级 | [Agent 启动、环境配置与会话绑定恢复](../features/agent-runtime/spec.md) |
| `1da87ce5` | 修复长文本粘贴并完善消息展开与会话删除交互 | [排队输入、立即提交与长文本粘贴](../features/queued-input/spec.md)、[历史会话删除与工作区会话清理](../features/session-lifecycle/spec.md)、[按轮加载历史与长消息展开](../features/timeline-history/spec.md) |
| `1097835c` | 记录删除会话时默认删除原始记录的产品决策 | [历史会话删除与工作区会话清理](../features/session-lifecycle/spec.md) |
| `ae91dc50` | 修复 Git 差异文件自动展开并稳定文件标识 | [编辑器文件跳转与差异浏览体验](../features/editor-diff-navigation/spec.md) |
| `7b6b06f4` | 为工作区添加工作树交付入口 | [Worktree 同步与 PR/MR 草稿交付](../features/worktree-sync-delivery/spec.md) |
| `cdd22313` | 为移动端工作区添加交付与管理入口 | [Worktree 同步与 PR/MR 草稿交付](../features/worktree-sync-delivery/spec.md)、[移动端工作区操作、Tab 改名与触摸拖拽](../features/mobile-navigation/spec.md) |
| `957994dd` | 修复工作树草稿表单的发布平台自动识别 | [Worktree 同步与 PR/MR 草稿交付](../features/worktree-sync-delivery/spec.md) |
| `8c341268` | 按需加载工作区交付目标并调整入口布局 | [Worktree 同步与 PR/MR 草稿交付](../features/worktree-sync-delivery/spec.md) |
| `3637a357` | update version | [Fork 标识、旧浏览器兼容与开发配置](../features/fork-platform/spec.md) |

覆盖所有提交表示每次改动均已归类，不表示每个测试场景已运行。功能内的源码与测试索引用于进一步审查。
