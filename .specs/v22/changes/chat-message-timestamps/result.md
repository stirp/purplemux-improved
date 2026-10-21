# 聊天消息时间实施与验证

## 实施

- 先编写[增量规格](./spec.md)，再实现共用 `src/components/features/timeline/message-timestamp.tsx`，由用户消息及 AI 文本回复组件复用。
- 使用项目已有 dayjs，显示浏览器本地日期和时分秒；`time.dateTime` 保留 ISO 时间，悬停标题包含时区偏移。
- 用户时间位于气泡底部右侧，AI 时间独立于 Markdown 正文；发送状态、图片和长消息按钮继续使用原有结构。
- KISS/DRY：仅共用一个展示组件，不引入依赖、计时器、存储、接口、配置或新的时间推断逻辑。
- 本次安装锁定依赖用于验证，package.json/pnpm-lock.yaml 未修改。

## 验证

2026-10-21 本工作树实际执行：

| 检查 | 命令/方式 | 结果 |
| --- | --- | --- |
| 完整类型检查 | `pnpm tsc --noEmit` | 通过 |
| 改动文件 ESLint | `pnpm exec eslint src/components/features/timeline/message-timestamp.tsx src/components/features/timeline/user-message-item.tsx src/components/features/timeline/assistant-message-item.tsx` | 通过 |
| 相关回归 | `pnpm exec vitest run tests/unit/lib/session-parser-codex.test.ts tests/unit/lib/session-parser-claude.test.ts tests/unit/lib/timeline-turn-pagination.test.ts tests/unit/lib/markdown-code-block.test.ts tests/unit/lib/timeline-display-hook.test.ts tests/unit/lib/input-message-match.test.ts` | 93 项通过 |
| 组件输出核对 | `TZ=Asia/Shanghai pnpm exec tsx -e '…'`，实际渲染三个组件并使用 JSDOM/Node assert 检查 | 通过，详见下文 |
| 生产构建 | `pnpm build` | 通过：Next.js 编译、页面生成、post-build 与 tsup 均成功 |
| 差异格式 | `git diff --check` | 通过 |

组件核对输入 `2026-10-20T23:59:58Z`，本地显示 `2026-10-21 07:59:58`，验证日期跨天、秒数、ISO 属性和 `+08:00` 标题；AI 回复晚两秒显示 `08:00:00`。检查纯图片用户消息也有时间，Sending 提示与时间共存，AI 时间位于 `.prose` 外部；缺失、null、NaN、Infinity、0、负数及超范围时间均不输出时间元素。首次核对脚本误将 React 静态 HTML 的 `dateTime` 属性按小写字符串匹配，已改用 DOM 属性断言并通过，产品代码未因此修改。

## 验收映射与限制

- 验收 1、2：组件输出核对覆盖用户、AI、图片、日期与无效时间；历史时间来源由两种解析器回归及源码检查覆盖。
- 验收 3：发送状态与时间共存通过组件核对；已有 hook 回归覆盖确认、重连 init/append 和 pending 合并，分页回归通过。
- 验收 4：共用组件、主题类、换行及对齐通过源码检查；Markdown 代码复制回归通过。未执行真实浏览器、手机或深浅主题视觉验收，不将 JSDOM 当作浏览器布局证据。
- 验收 5：自动化检查结果见上表。
- 历史原始 JSONL 没有时间时，解析器已有的当前时间回退保持原样，本次无法恢复原始发送/回复时刻。
- 未提交、推送或发布；正在运行的应用需加载本工作树构建后才能看到变更。

## PR #83 审查修正

针对[审查意见](https://github.com/stirp/purplemux-improved/pull/83#discussion_r4338290788)，确认 `web-input-bar.tsx` 已将包含 `createdAt` 的队列快照传入共用 hook，但 `addPendingUserMessage` 一直使用 `Date.now()`，导致稍后打开或重新挂载页面时显示错误时间。

修正 `src/hooks/use-timeline.ts`：首次构建待确认条目使用 `queueMessage.createdAt ?? Date.now()`。复用已有快照和更新路径，保持状态更新期间的时间稳定、投递尝试边界及原生回执的时间语义；不新增 API 或时间存储。

在 `tests/unit/lib/timeline-display-hook.test.ts` 增加 3 项回归：

- 入队 5 分钟后首次挂载、10 分钟后重新挂载都保留原时间，随后发送状态更新不改时间，原生回执到达后使用回执时间。
- 旧队列快照缺少 `createdAt` 时使用首次创建时间，后续状态更新不刷新该时间。
- 普通非队列待确认消息使用提交时间。

本轮实际执行（2026-10-21）：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 修复前复现 | `pnpm exec vitest run tests/unit/lib/timeline-display-hook.test.ts` | 新增恢复时间用例失败（错误显示挂载时间）；22 项通过、1 项失败 |
| 修复后回归 | `pnpm exec vitest run tests/unit/lib/timeline-display-hook.test.ts tests/unit/lib/input-message-match.test.ts tests/unit/lib/timeline-display-cache.test.ts` | 35 项全部通过 |
| 改动文件 ESLint | `pnpm exec eslint src/hooks/use-timeline.ts tests/unit/lib/timeline-display-hook.test.ts` | 通过 |
| 完整类型检查 | `pnpm tsc --noEmit` | 通过 |
| 生产构建 | `pnpm build` | 通过：Next.js、页面生成、post-build 和 tsup 均成功 |
| 文档及差异 | 规格相对链接检查、`git diff --check` | 通过 |

本轮未执行浏览器/手机视觉验收；验证重点为实际 hook 挂载、重新挂载及队列/回执交互。未提交、推送或回复远端审查。
