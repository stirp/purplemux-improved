# 验证记录

验证日期：2026-10-15。以下均为本次工作区实际执行结果。

## 自动化检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 相关测试 | `pnpm exec vitest run tests/unit/lib/markdown-code-block.test.ts tests/unit/lib/editor-file-link.test.ts tests/unit/lib/markdown-browser-compatibility.test.ts` | 3 个文件，25 项通过，其中新增 6 项 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过；初次发现测试计划缺少 `toolUseId`，补齐后重跑通过 |
| 改动 TS/TSX ESLint | `pnpm exec eslint src/components/features/timeline/markdown-code-block.tsx src/components/features/timeline/assistant-message-item.tsx src/components/features/timeline/plan-item.tsx tests/unit/lib/markdown-code-block.test.ts` | 通过 |
| 差异格式 | `git diff --check` | 通过 |

## 验收映射

| 条款 | 本次证据 | 结果 |
| --- | --- | --- |
| CB-01 | 测试验证带语言、无语言、缩进代码块及行内代码；真实浏览器打开 AI 回复和计划弹窗 | 通过 |
| CB-02 | 测试验证高亮、中文、特殊字符、缩进、空行、末尾换行、多块独立复制；浏览器粘贴结果与目标 `pre.textContent` 完全一致 | 通过 |
| CB-03 | 模拟权限拒绝与回退失败后重试；假时钟检查两秒复位和卸载清理；浏览器确认“已复制” | 通过 |
| CB-04 | 更新消息后复制最新内容；安全上下文 `writeText` 和非安全上下文 `execCommand` 分支均执行组件测试 | 通过；HTTP 分支为 jsdom 模拟 |
| CB-05 | Chromium 390×844、1280×900，深浅主题；Tab 聚焦、Enter 复制，计划弹窗点击复制；检查长行滚动时按钮位置不动 | 隔离组件页面通过 |
| CB-06 | 上述测试、完整 TypeScript 和 ESLint | 通过 |

## 浏览器验证与限制

- 使用 agent-browser 独立会话 `ai-code-copy-ws3ew30b`，由 esbuild 和项目 PostCSS/Tailwind 构建临时页面，加载实际 `AssistantMessageItem`、`PlanItem`、中文词条和 `globals.css`。
- 页面由本地临时 HTTP 服务提供；未增加应用测试路由，未访问或更改真实会话。
- DOM 几何检查：390px 窄屏下所有复制按钮均在视口内，位于代码上方；长代码可独立滚动，按钮位置不变；修正默认留白后 `pre` 上下外边距为 0。
- 浏览器剪贴板读取权限被拒绝，改用真实粘贴操作验证内容，结果匹配。
- 截图临时保存在 `/tmp/ai-code-copy-Lx8v2d/`：`mobile-light.png`、`mobile-dark.png`、`mobile-plan-dark.png`、`desktop-light.png`、`desktop-dark.png`；临时文件不作为仓库持久化产物。
- 本次执行了组件浏览器验收，未运行完整 Next.js 生产构建、全量测试、真实会话端到端测试、移动设备或 Electron 实机验收。

## PR #43 审查修复验证（2026-10-16）

以下为此次计时修复的实际执行结果，前文 2026-10-15 浏览器结果仅为历史记录。

| 检查 | 命令或场景 | 结果 |
| --- | --- | --- |
| 修复前复现 | `pnpm exec vitest run tests/unit/lib/markdown-code-block.test.ts`；首次成功后 1900ms 再次复制，再过 100ms | 7 项通过、1 项失败；反馈错误地恢复为 `copyCode`，成功复现审查问题 |
| 修复后相关测试 | `pnpm exec vitest run tests/unit/lib/markdown-code-block.test.ts tests/unit/lib/editor-file-link.test.ts tests/unit/lib/markdown-browser-compatibility.test.ts` | 3 个文件、27 项通过 |
| 连续成功（CB-03） | 1900ms 时再次复制，旧到期点及第二次成功后 1999ms 仍显示成功，2000ms 恢复 | 通过 |
| 连续失败与重试（CB-03） | 成功后再次复制失败，立即恢复按钮并清理计时器；重试成功保持完整两秒 | 通过 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 改动文件 ESLint | `pnpm exec eslint src/components/features/timeline/markdown-code-block.tsx tests/unit/lib/markdown-code-block.test.ts` | 通过 |
| 差异格式 | `git diff --check` | 通过 |

本次仅修改反馈状态和计时器生命周期，使用组件假时钟验证精确时间边界，未重复执行浏览器、生产构建、全量测试或实机验收。修复尚未提交或推送，远端 CI 结果不代表本次本地变更。
