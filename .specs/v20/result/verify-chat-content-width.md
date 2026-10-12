# Chat 内容区比例宽度验证记录

- 日期：2026-10-12
- 规格：[timeline-history](../features/timeline-history/spec.md)

## 本次实际检查

| 检查 | 命令或方式 | 结果 |
| --- | --- | --- |
| 完整 TypeScript | `pnpm exec tsc --noEmit` | 通过 |
| 改动 TSX 的 ESLint | `./node_modules/.bin/eslint`，timeline-view、web-input-bar、quick-prompt-bar、agent-status-line | 通过 |
| 现有回归 | `./node_modules/.bin/vitest run tests/unit/lib/region-typography.test.ts tests/unit/lib/region-typography-interaction.test.ts tests/unit/lib/timeline-turn-pagination.test.ts tests/unit/lib/timeline-tasks.test.ts` | 4 文件 48 项通过 |
| 生产 CSS 编译 | Node 调用 `postcss` 与 `@tailwindcss/postcss`，`optimize: { minify: true }` 编译完整 globals.css | 通过，产物包含 `.chat-content{width:85%;margin-inline:auto}` |
| 差异格式 | `git diff --check` | 通过 |

此工作树起初无 node_modules，通过链接主工作树已安装依赖进行检查，没有安装或更新依赖。`pnpm exec eslint` 和 `pnpm exec vitest` 首次调用触发包管理器自动安装尝试，因无 TTY 拒绝替换依赖目录；随后直接调用已安装工具成功。未改变锁文件。

## 验收映射与限制

- CW-01：源码检查及生产 CSS 编译确认所有相关外层共用 85% 居中规则，无 max-width；不代表浏览器视觉验收。
- CW-02：CSS 百分比以包含块为基准，1920/2560/390px 面板对应 1632/2176/331.5px。此处为规则计算值；窗口缩放、移动端与分屏的实际浏览器测量未执行。
- CW-03：源码差异确认保留内部 padding、用户气泡限制和统计/报告的 max-w-content；现有字体、分页与任务回归通过。
- 本次仅执行完整生产 CSS 编译，未执行 Next.js 全量应用构建、浏览器或真实设备验收。未将源码检查、公式计算或已有历史证据表述为视觉验收通过。
