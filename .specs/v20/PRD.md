# v20 需求整理：Fork 后累计新增功能

2026-10-07 增量：[Sessions 导航同步侧边栏项目](./requirements/session-workspace-navigation.md)，进入历史会话时显示并选择所属项目。

2026-10-05 增量：[AI 提交信息生成超时兼容](./requirements/ai-git-generation-timeout.md)，补充网关错误解析、有限等待、草稿保留与提交结果不确定时的恢复约束。

## 来源与版本范围

- [原始需求与基线](./requirements/fork-enhancements.md)
- [全量提交覆盖表](./requirements/commit-coverage.md)
- [项目约定](../../CLAUDE.md)

v20 覆盖 `52140216..3637a357` 的 fork 增量，共 48 个非合并提交，按 19 个功能模块整理。当前应用版本为 `0.5.1`，升级版本号只是其中的平台元数据变更。

## 功能列表

| 编号 | 功能规格 | 核心变化 |
| --- | --- | --- |
| 01 | [工作区目录选择、布局与层级管理](./features/workspace-management/spec.md) | 目录浏览器支持选择服务器目录并批量创建工作区。 |
| 02 | [Worktree 创建、接入与安全删除](./features/worktree-lifecycle/spec.md) | 从工作区创建独立分支和 Git Worktree，并建立子工作区供 Agent 使用。 |
| 03 | [Worktree 检索、空间统计与批量清理](./features/worktree-organization/spec.md) | 按分支和工作区名称检索工作树，结合最后打开时间组织空闲候选。 |
| 04 | [Worktree 同步与 PR/MR 草稿交付](./features/worktree-sync-delivery/spec.md) | 预览与目标分支的差异，显式 fetch，并支持 merge、rebase、冲突后的 continue/abort。 |
| 05 | [AI 分支名生成与分支快速筛选](./features/ai-branch-naming/spec.md) | 根据需求描述生成分支名，设置中可配置生成提示词及 provider。 |
| 06 | [AI 提交信息、PR/MR 文案与提交确认](./features/ai-git-writing/spec.md) | 为仓库全部可提交改动生成可编辑的提交标题和正文，支持保存自定义生成提示词。 |
| 07 | [排队输入、立即提交与长文本粘贴](./features/queued-input/spec.md) | Web 输入默认排队；Agent 忙碌时保留后续消息，空闲后按顺序发送。 |
| 08 | [历史会话删除与工作区会话清理](./features/session-lifecycle/spec.md) | 工作区会话列表和全局 Sessions 支持移除历史项，并可同时删除 Claude/Codex 原始记录。 |
| 09 | [Claude/Codex 交互式问题卡片](./features/interactive-questions/spec.md) | 统一 Claude 与 Codex 的交互式选项卡片样式。 |
| 10 | [Agent 状态栏与 Todo/Plan 进度](./features/agent-progress/spec.md) | 桌面及移动端展示 CLI 实际渲染的 Claude/Codex 状态栏，终端收起后仍可见。 |
| 11 | [Web 输入联动 CLI 原生命令菜单](./features/native-commands/spec.md) | Web 输入框中的 / 操作联动当前 Claude/Codex CLI 原生命令菜单。 |
| 12 | [Agent 启动、环境配置与会话绑定恢复](./features/agent-runtime/spec.md) | 改善嵌套 shell 中的 Claude 进程识别、preflight 和 TUI 就绪检测。 |
| 13 | [按轮加载历史与长消息展开](./features/timeline-history/spec.md) | Claude/Codex 时间线按一个对话轮次加载历史，减少一次读取大量记录。 |
| 14 | [编辑器文件跳转与差异浏览体验](./features/editor-diff-navigation/spec.md) | 扩展编辑器远程连接和带行列位置的文件链接，统一打开目标逻辑。 |
| 15 | [移动端工作区操作、Tab 改名与触摸拖拽](./features/mobile-navigation/spec.md) | 移动端工作区行内操作、上下文菜单、换行布局及子 Worktree 标识。 |
| 16 | [终端流控与移动端视口](./features/terminal-rendering/spec.md) | 浏览器解析端对终端输出进行排队和确认，服务端依据消费进度进行背压控制。 |
| 17 | [浏览器存储清理、翻译刷新与异常恢复](./features/browser-recovery/spec.md) | 设置页支持清理浏览器本地存储、缓存、Service Worker 和可枚举的 IndexedDB。 |
| 18 | [附件草稿与上传访问保护](./features/attachments/spec.md) | 改善 Web 输入附件草稿处理及上传客户端错误处理。 |
| 19 | [Fork 标识、旧浏览器兼容与开发配置](./features/fork-platform/spec.md) | 应用与包标识改为 purplemux-improved，保留 purplemux/pmux 别名及 ~/.purplemux 数据目录。 |

## 主要产品要求

1. 支持需求在独立 Worktree 中并行开发，从创建、管理到同步、提交和 PR/MR 草稿交付形成完整操作流程。
2. 提升 Claude/Codex 的 Web 交互：队列、直接回答、原生命令、状态栏、计划和按轮历史。
3. 桌面与移动端共享工作区能力，同时补足触摸拖拽、视口适配和工作树入口。
4. 历史会话、文件上传、Git 操作和清理行为以当前源码保护条件为准，记录真实默认值与失败状态。
5. 保留原命令别名和数据目录兼容，补齐浏览器恢复、语言资源与旧 Safari 支持。

## 约束与决策

- [删除会话的默认行为](../../docs/11-decisions/2026-09-28-session-deletion-default.md)：有原始 ID 时默认同时删除，可取消勾选；最终确认和活动会话保护必须保留。
- Git 同步方向为目标分支进入当前工作树；push、commit、创建草稿均是独立操作。
- 无工具 AI 文本生成当前使用 Claude；Codex 不支持的场景必须明确反馈。
- 当前实现是验收基线，不能把曾经存在但已修复的行为写成需求。
- 所有功能均有实现入口和已有测试索引；本次未重新运行完整测试或真实设备验收。

## 新增需求安排

| 需求 | 优先级 | 状态 | 关联功能 |
| --- | --- | --- | --- |
| [无同步目标时默认当前分支](./requirements/sync-target-current-branch.md) | P2 | 已实现，自动化回归通过 | [worktree-sync-delivery](./features/worktree-sync-delivery/spec.md) |

此项为 2026-09-29 新增需求，不计入上述历史提交回补范围。无有效保存目标或创建基线时，默认选择所打开工作树的当前本地分支；保留已有目标、用户选择和同步执行保护。

## 状态与后续维护

[任务表](./task.md)区分源码存在、文档完成和运行验收；[验证记录](./result/verify-1.md)说明本次检查范围。后续新增 fork 功能需同步更新本清单、对应规格与覆盖表。

## 按代理环境配置增量

[独立环境变量需求](./requirements/per-agent-environment.md)扩展 agent-runtime，分别保存并应用 Claude/Codex 配置；实施与验证状态见任务表。

## 区域字体设置增量

[区域字体需求](./requirements/region-typography.md)新增设置 → 外观中的五区域字体、字号与字色调整。
[功能规格](./features/region-typography/spec.md)记录范围、交互、接口和验收条件。
此项为 2026-10-03 新增需求，不计入历史提交回补范围；自动化与实机状态见任务表及验证记录。

区域字体 Review 增量补充 RT-10 至 RT-17：重绘、颜色编辑一致性、保存去重、同步竞态、错误反馈、样式生命周期及标签栏行高。

2026-10-05 架构复审补充 RT-18 至 RT-23：完整配置快照广播、通用 hydrate 同步、组件区域 CSS 变量和显式终端 props；替换区域专用同步状态机。
