# 触屏视口滚动约束验证记录

2026-10-13 本次实际执行：

| 检查 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm exec eslint src/components/layout/page-shell.tsx` | 通过 |
| `pnpm build` | 通过，Next.js 24 个静态页面生成完成，tsup 构建成功 |
| `pnpm exec eslint src/styles/globals.css` | CSS 文件无匹配规则，被忽略；未视为 CSS lint 通过 |
| `git diff --check` | 通过 |

验收映射：根层滚动限制由应用外壳存在与否限定，触屏固定 body 由触屏媒体查询限定；内部滚动容器没有改动。未执行桌面 Web 浏览器或 iPad/iPhone 实机验证，底部灰色区域、非对话拖动方向、内部滚动及键盘切换仍待人工确认。

## 2026-10-14 PR #35 Review 修复验证

| 检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/page-shell-viewport.test.ts` | 2 项通过，覆盖桌面与移动外壳挂载及卸载清理 |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm exec eslint src/components/layout/page-shell.tsx tests/unit/lib/page-shell-viewport.test.ts` | 通过 |
| `pnpm build` | 通过，Next.js 24 个静态页面生成完成，tsup 构建成功 |
| `git diff --check` | 通过 |

已移除 `:has()`，文档级 CSS 改用 `html.app-viewport-active` 作用域；Firefox 111 实际浏览器与 iPad/iPhone 实机尚未验收。
