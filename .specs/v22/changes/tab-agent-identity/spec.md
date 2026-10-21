---
page: tab-agent-identity
title: Tab Agent 身份与显示视图解耦
status: DETAILED
depends_on:
  - ../../../v20/features/agent-runtime/spec.md
  - ../../../v19/features/codex-panel-ui/spec.md
  - ../codex-terminal-provider-identity/spec.md
  - ../claude-terminal-mode-detection/spec.md
---

# Tab Agent 身份与显示视图解耦

## 原始需求

新建 Codex Tab，使用斜杠命令进入 TUI 选择 Code Review，review 期间从 Chat 切到 Terminal 后被识别为 node，会话管理出现异常形态。用户要求完整解决方案，不以 tmux 进程名特判打补丁。

## 证据与模型

只读检查受影响 Tab：布局仍有 `agentState.providerId=codex` 和原生根会话 ID，但 `panelType=terminal`、标题为 node，CLI 查询返回空 provider/session。当前消费方按视图选择 provider，导致已有身份不可见。

- `panelType` 是视图；`agentState` 是持久 Agent 绑定；`currentProcess` 是 tmux 观测值；`cliState`/进程检测表示运行状态。这四者不得相互替代。
- 复用现有 agentState 格式，不引入另一套绑定数据库或按进程名猜测 node 身份。
- 新建 Agent Tab 即建立 provider 绑定，允许会话 ID 为空。旧布局按已有 agentState、Agent 面板类型、旧 Claude 字段恢复；普通 Terminal/node 没有证据时不绑定。
- Chat/Terminal 切换保持 provider、根会话 ID、JSONL、摘要及工作状态。显式切换另一 Agent 时按原切换锁执行，再初始化新 provider 的绑定；两端共用转换规则，保留旧 Claude 字段兼容。
- 状态初始化、轮询、hook 校验、JSONL watcher、历史记录、CLI 查询、自动恢复和空闲回收读取稳定绑定，不依赖当前视图。Codex review 子会话不能替换根绑定。
- 退出只改变运行状态，保留可恢复身份；进程检测不能用子会话 ID 覆盖同 provider 已有根绑定。确认退出后菜单仍显示启动入口；失败/超时保留最近运行证据。
- 退出检测只有不早于最近 Agent 活动事件时才能解锁另一 Agent 的切换；收到更新的活动事件后不能继续使用旧退出结果。无效检测响应不能成为退出证据。桌面、移动端和快捷键遵循同一规则。
- 会话列表按 provider + 原生会话 ID 去重，无 ID 时按 provider + Tab 建立临时项，切换 Terminal 不新增、丢失或错误归类。未知 provider 不默认为 Claude。
- 桌面/移动端标题使用绑定身份，原始进程观测值仍保留。标题不是身份来源。

## 覆盖与不变边界

替代 codex-panel-ui 及相关检测增量中依赖当前 panelType 推导会话身份的部分，以及 Terminal 进程退出时清空会话身份的条款。仍沿用实时进程检测、请求期限及时间戳保护、切换锁、根会话策略、安全 shell 检查、用户标题/标签/工作状态持久化。
不更改 tmux、启动器或用户原生 Agent 配置；不自动修改现场历史记录。已经失去全部来源的旧异常历史项不按标题推测或删除。

## 验收标准

1. Codex/Claude 新建、旧数据加载、Chat → Terminal → Chat、刷新/重连/服务状态重建，身份和根会话保持一致；普通 node 不识别为 Agent。
2. Terminal 下 Codex review 进入/完成仍更新 busy/review，根 JSONL watcher 持续工作；其他 provider hook 和 review 子会话不能覆盖绑定。
3. Terminal 下轮询、CLI 及会话列表返回正确身份；会话 ID 为空时保留单个临时项，首次绑定仍迁移用户元数据。
4. 确认退出保留绑定但显示启动入口；切换到另一 Agent 初始化正确身份；进程检测失败/迟到不覆盖新状态。
5. 自动恢复、空闲回收和安全检查不因显示视图改变使用错误 provider；不把持久绑定当作进程存活证据。
6. 运行相关回归、完整 TypeScript、改动文件 ESLint、构建；按实际执行记录浏览器/实机限制。

## Review 修正：前台任务保护与自定义名称

- Terminal（含旧数据未指定 panelType）即使绑定 Agent，也必须满足 idle terminal status 和 SAFE_SHELLS 前台命令，才能通过 Worktree 安全检查。绑定 Agent 的工作状态还需满足原 Agent 空闲规则；不得因持久身份或合成的 idle terminal status 放行 make、vim、node 等前台任务。
- 严格 pane 快照优先于缓存进程信息，缺失 pane 或无法确认前台 shell 时拒绝；不改变原有 Chat 面板的空闲判断规则。
- Terminal 标签继续优先展示用户自定义名称；仅无自定义名称时回退进程标题。绑定身份用于图标及状态，不用于选择标题优先级。Chat 的上游解析标题优先级保持不变。
- 回归覆盖两种 provider、空闲状态下的非 shell 前台、严格快照与缓存不一致、busy 状态的 shell；实际组件覆盖绑定 Agent 的 Terminal 自定义名称、名称更新和空名称回退。

见 [任务](./task.md)和[结果](./result.md)。
