# Sessions 与 Workspace 工作状态实施记录

日期：2026-10-13。先读取 CLAUDE.md、session-lifecycle、workspace-management 和 agent-progress 规格，再新增[需求](../requirements/session-task-status.md)并同步相关详情。

## 实现

- session-workflow.ts 统一会话去重、默认状态、人工覆盖及 Workspace 汇总规则，UI 和任务状态共用。
- workspaces.json 的 sessionWorkflow 保存人工状态与分类折叠；沿用 workspace-store 的全局锁、原子写入与 workspace 同步，旧数据缺省为空。
- PATCH /api/session-workflow 严格校验单项更新，支持恢复自动判断；失败返回 500 并在界面提示。
- Sessions 分类为未开始、进行中、审批中、已完成，按完整会话计数；每项选择工作状态，分类标题支持折叠。
- 保留历史轮次展开、历史删除/恢复导航，以及模型执行中和等待输入提示。人工完成不改变 TCliState。
- Workspace 行展示本工作区关联会话汇总状态，原 Tab 运行图标继续显示；子工作区和 Todo/Plan 不参与。
- 同步 docs/STATUS.md 和全部现有语言通知词条。

## 原则

复用现有磁盘存储与同步，避免额外数据库或消息协议；共享纯函数消除分类和汇总逻辑重复；不引入自定义状态编辑器或 Git 操作。

## 限制

浏览器/实机未验收。首次身份绑定迁移已在 Review 修复中补齐；旧版本已经裁剪且从未保存关联的会话无法凭人工状态键恢复 Workspace，升级只回补仍保留的历史及当前 Tab。


## Review 修复（2026-10-13）

- 当前历史项禁用导航时比较 provider/session ID，复用 Tab 不误判旧会话。
- sessionWorkflow.sessions 独立保存会话关联和最近一轮摘要，tabBindings 记录首次绑定；同锁消费 fallback，已有原生人工状态优先。
- StatusManager 状态广播触发持久化；传入独立快照避免异步写入读到随后切换的会话。GET Workspace 回补原有数据和运行快照。
- 新增历史在获取历史写锁前更新持久索引，再裁剪轮次；避免与 Workspace 删除的锁顺序形成循环。
- 历史删除 API 清除索引与人工状态；Workspace 删除在自身锁内清除关联索引，不重复获取同一锁。
- useSync 每次 onopen 补拉 Workspace。回归测试使用真实客户端 store 验证断线期间人工状态和折叠偏好的变化。

## 第二轮 Review 修复（2026-10-13）

- sessionWorkflow.deleted 在 Workspace 全局写锁内持久保存删除标记；回补在该锁内补读 hidden-sessions，合并旧标记，排除迟到的历史与残留 Tab。
- 客户端派生同样排除 deleted；删除成功后本地同步消费索引和状态，避免直接从旧运行快照再次显示。
- 索引增加 navigation，只保存恢复所需身份和 Workspace 元数据，不创建虚假的历史轮次；老的无轮次索引可从其原生键及仍存在的 Workspace 回补。
- navigateToSession 接受专用恢复目标；无轮次条目使用该目标判断当前会话、恢复及删除。A/B 复用一个 Tab 或关闭 Tab 后都按原生 ID 定位。
- 复用历史删除组件、会话恢复工具和现有全局锁，避免另建恢复或删除通道。
