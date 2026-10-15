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

## 2026-10-15 问题选项聚焦导致灰色空白修复验证

本轮先依据新增验收条件修改规格，再增加消息滚动容器的 `relative`。复用主工作树已安装依赖进行检查，分屏库版本与锁文件一致，均为 `react-resizable-panels 4.10.0`。

| 检查 | 本轮实际结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过，完整项目类型检查 |
| `pnpm exec eslint src/components/features/timeline/timeline-view.tsx` | 通过 |
| `pnpm exec vitest run tests/unit/lib/page-shell-viewport.test.ts tests/unit/lib/async-question-answers.test.ts tests/unit/lib/timeline-display-hook.test.ts` | 16 项通过 |
| `git diff --check` | 通过 |
| Chrome 真实组件桌面与窄屏回归 | 通过，详情如下 |

### 浏览器方法与验收映射

使用 agent-browser 独立会话 `gray-border-fix`、Chrome 147 和本地预览 `http://127.0.0.1:8141`。临时脚本 `/tmp/purplemux-gray-analysis/real-preview.cjs` 通过 esbuild 打包本工作树的真实 `TimelineView`、`AskUserQuestionItem`、消息渲染与滚动依赖，用实际全局样式经 Tailwind/PostCSS 编译；Panel 使用真实分屏库。会话数据、输入框外壳、状态栏及 Next 路由使用测试夹具，网络提交被模拟，未向真实会话发送答案。

1. 桌面 1280×1000：长回复末尾显示问题卡片，点击选项、按 ArrowDown 切换选项、在消息区域向下滚轮 1500px；选中状态正确，外层滚动位置为 0，输入框顶部始终为 892px。
2. 将回复从 16 段增长至 40 段并再次点击：消息列表内容高度增长至 1830px，正常滚动至底部；外层高度与内容高度均为 936px，滚动位置为 0。
3. 负向对照：仅在测试页面移除消息滚动容器的 `relative`，外层内容高度变为 1624px；点击选项后外层滚动至 688px，输入框顶部从 892px 移至 204px，出现灰色区域。恢复该类后外层高度恢复为 936px，滚动位置归零。
4. 窄屏 390×844：重复选项点击、ArrowDown、滚轮，继续增长至 48 段并结束忙碌状态。消息内容高度为 3054px，内部可滚至 2390px；外层高度与内容高度均为 780px，滚动位置为 0，输入框顶部保持 736px。
5. 隐藏单选框的 `offsetParent` 为消息 `role="log"` 容器；浏览器错误列表为空。桌面与窄屏截图均人工检查，输入框和状态栏未被外层滚走。

临时截图位于 `/tmp/purplemux-gray-analysis/real/`：`fixed-desktop.png`、`control-without-relative.png`、`fixed-narrow.png`，仅作为本次运行辅助证据，不是仓库持久产物。

### 限制

本轮未执行生产构建、完整应用真实会话端到端、Firefox/Safari 或移动设备实机验收。CSS 定位缺陷由真实 Chrome 布局和聚焦验证，16 项单元测试不作为浏览器布局通过的替代证据。
