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
