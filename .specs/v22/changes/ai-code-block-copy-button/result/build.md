# 实施记录

## 代码已实现

- `src/components/features/timeline/markdown-code-block.tsx`：共享 Markdown `pre` 渲染器，顶部右侧常显复制按钮；直接读取当前 `pre.textContent`，保留高亮后的纯文本及空白。
- AI 回复 `assistant-message-item.tsx` 和计划详情 `plan-item.tsx` 注册同一渲染器，行内代码不受影响。
- 复用 `Button`、`copyToClipboard` 和 sonner；成功显示两秒反馈，卸载清理计时器，失败提示并可重试。
- 复制操作行位于横向滚动区域外；覆盖 typography 默认 `pre` 上下外边距以消除操作行与代码间的多余留白。
- `messages/*/timeline.json`：11 种语言增加复制、成功、失败文案。
- `tests/unit/lib/markdown-code-block.test.ts`：6 项交互回归测试。

## 原则与范围

KISS/YAGNI：只增加现有 Markdown 代码块所需操作，不新增依赖、配置或 API。DRY/单一职责：两个入口复用同一组件，剪贴板兼容交给已有工具，保留既有高亮和文件链接逻辑。

先补齐[规格](../spec.md)再实现代码。未执行 Git 提交、推送、分支操作或发布。

## PR #43 审查修复（2026-10-16）

- 对应[审查意见](https://github.com/stirp/purplemux-improved/pull/43#discussion_r4286274691)：重复复制成功时布尔状态不变，导致旧计时器提前清除反馈。
- 将布尔状态改为当前反馈期间的成功次数，由其派生是否显示成功；每次成功递增使 effect 清理旧计时器并重新计时，失败或到期归零，卸载仍清理计时器。
- KISS/DRY：继续使用单一状态及原有 effect 管理计时器，不新增 ref、依赖或复制兼容分支。
- 新增两项回归测试；本次修改已在本地完成，提交和推送待用户明确确认。
