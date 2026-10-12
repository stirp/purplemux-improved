# Claude 启动信任提示实施记录

日期：2026-10-10。

依据：[需求](../requirements/claude-startup-prompts.md)、[agent-runtime 规格](../features/agent-runtime/spec.md)及其 ui、flow、api 详情；本次先补齐行为约定，再修改源码。

## 变更入口

- `pane-container.tsx`、`mobile-surface-view.tsx`：信任检测不受 inactive 限制，传入当前标签 scopeKey，终端输出解析成功后触发检测。
- `use-trust-prompt-detector.ts`：启用与切换标签时检测当前缓冲，按标签隔离卡片及定时器；回答前重新匹配目录和代理。
- `trust-prompt-detector.ts`：识别无编号 Claude 选项的当前光标及顺序，复用回答输入函数；保留旧编号提示和 Codex 输入。
- `docs/STATUS.md`：同步启动卡片与会话状态的关系。

复用已有 TrustPromptCard、终端缓冲和 sendStdin，不增加接口、持久化配置、翻译或重复 UI；检测、按键计算及渲染各自保持单一职责。

未执行 Git 提交、推送或发布。验证结论见[验证记录](./verify-claude-startup-prompts.md)。

## Review 修复

- 分开发送导航/数字与 Enter；沿用 80ms 间隔，Enter 前校验最新光标；标签或会话切换、禁用及卸载时取消提交。
- 选项改用共享 parsePermissionOptions，补充其无编号换行处理；getBufferText 按 xterm isWrapped 合并真正软换行，保留空格和硬换行。
- 最近提示块内统一获取目录、选项和光标；答案只按选项前缀识别，括号里的 Yes 不会覆盖 No。
- ITrustPromptInfo.selection 改为 numbered/navigation/unavailable 判别联合，未知无编号光标禁用答案，不回退数字输入。
- 校验失败不清卡片；TrustPromptCard 等待异步回答并恢复按钮，允许重试。
- scopeKey 加入代理会话 ID，桌面和移动端 ACK 均显式调用；移动 Claude 增加查看终端入口。
- 去除仅用于比较的光标字段比较；卡片仅在目录、代理或可回答模式变化时刷新。测试使用待执行定时器刷新，不依赖 debounce 的数值。
