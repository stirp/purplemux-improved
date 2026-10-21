# 实施与验证

## 实施

按 [规格](./spec.md) 实施，DETAILED 仅表示行为约定完成。

- `terminal-page.tsx`：Web 单分屏且 Git 侧栏关闭、内容区空间充足时，将公共操作组件作为工具槽传入分屏；其他场景保留原公共栏。空间判断见下方评审修复记录。
- `pane-layout.tsx`、`pane-container.tsx`、`pane-tab-bar.tsx`：传递工具槽，标签与工具共享一行；标签保留横向滚动，分隔边框由公共行承载。更新 memo 比较条件，避免工具状态与回调被缓存。
- `content-header.tsx`：复用现有资源、编辑器、分屏和 Git 控件，支持行内模式。隔离行内点击，避免分屏后冒泡到旧面板而改变焦点。
- `app-header.tsx`：移除移动品牌及分隔符，保留工作区名称及所有必要入口。
- `settings-dialog.tsx`：显式覆盖默认弹窗的 top/left 居中值，设置移动视口全宽高并复用 visualViewport Hook；处理四边安全区，关闭和分类按钮提供 44px 热区。桌面弹窗取消溢出的最小宽度、限制短屏高度，分类与正文可滚动。

复用组件和 Hook，不增加配置、API 或依赖；布局通过可选插槽组合，不复制操作逻辑，遵循 KISS、DRY、单一职责和 YAGNI。

## 初次实施自动化验证

2026-10-21，当前工作树，Node 24.14.1；node_modules 链接至本机主仓库依赖，未修改依赖清单。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 资源、可用视口、区域字体与分屏回归 | `pnpm exec vitest run tests/unit/lib/system-resources-ui.test.ts tests/unit/lib/visual-viewport.test.ts tests/unit/lib/region-typography.test.ts tests/unit/lib/layout-close-pane-focus.test.ts tests/unit/lib/layout-tab-creation-client.test.ts` | 43 项通过 |
| 工具栏点击隔离 | `pnpm exec vitest run tests/unit/lib/content-header-interaction.test.ts` | 1 项通过，覆盖分屏选中新面板不被外层抢回、Git 回调可用 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过；新增测试最初缺少 provider children 类型，修正后重跑 |
| ESLint | `pnpm exec eslint` 后接本次 7 个 TSX 文件及新增测试 | 通过 |
| 差异与链接 | `git diff --check`、需求目录 Markdown 相对链接检查 | 通过 |

## 初次实施浏览器组件验证

使用 agent-browser 独立会话 `tab-header-space`，临时服务 `http://127.0.0.1:18357`。编译当前工作树真实 AppHeader、ContentHeader、PaneTabBar、SettingsDialog、UI 组件和 Tailwind CSS。Next Router、通知计数和工作区编辑弹窗使用替身，请求使用固定夹具，工作区正文为占位。

| 验收项 | 本次实际结果 |
| --- | --- |
| 桌面合并与多标签 | 容器 480/640/1000px × 标签字号 12/40px，共 6 组无行溢出，标签可滚动，资源及 Git 按钮在行内；40px 标签自然增高，无固定行高裁切 |
| 操作与布局转换 | 真实资源浮层打开/Escape 关闭并还原焦点；新建菜单选择 Web Browser 后夹具标签从 12 增至 13；分屏与关闭、Git 打开与关闭回调驱动夹具在公共栏和合并行间切换 |
| 移动顶栏 | 320px 检查无品牌及分隔符，无页面横向溢出，菜单、资源、退出均保留 44px 热区 |
| 设置尺寸 | 320×640、390×844、430×932、740×360、768×600、1280×800、1280×360 × 浅深色 × 16/20px 根字号，共 28 组通过。移动弹窗四边对齐视口，桌面居中且不越界 |
| 设置滚动与关闭 | 全部场景正文可滚动到底部，Escape 可关闭；另验证关闭按钮可关闭并将焦点交还“打开设置”；移动关闭与分类按钮至少 44px |

证据：[桌面合并](./result/desktop-merged.png)、[移动顶栏](./result/mobile-header.png)、[移动设置](./result/mobile-settings.png)、[深色设置](./result/mobile-settings-dark.png)、[横屏大字设置](./result/landscape-settings.png)、[桌面测量](./result/desktop-results.json)、[设置测量](./result/layout-results.json)。

## 评审 P2 修复与本次验证（2026-10-21）

初次检查未覆盖 800px 桌面窗口被 400/480px 侧栏挤占后的内容区。原先只依据单分屏与 Git 开关合并工具栏，导致标签列表归零和新建入口被遮挡。

- 先更新本需求规格，明确内容宽度不足时恢复独立工具栏。`use-header-space.ts` 使用 ResizeObserver 监听内容区与工具栏两个控件组；按控件实际宽度、2rem 边距预算和至少 200px 标签栏预算判断是否能合并。
- 两种布局均测量不收缩的控件组，不把独立工具栏的整行宽度当作所需宽度，避免合并/恢复的循环。DOM 卸载或替换时断开旧 observer；未完成测量时保留独立工具栏。
- `terminal-page.tsx` 消费空间判断，`content-header.tsx` 暴露测量 ref 并保持控件组固有宽度。复用原公共栏与工具槽，不复制操作逻辑，不引入依赖、配置或额外轮询；遵循 KISS、DRY、单一职责与 YAGNI。

| 本次检查 | 命令或方法 | 实际结果 |
| --- | --- | --- |
| 单测 | `pnpm exec vitest run tests/unit/lib/header-space.test.ts tests/unit/lib/content-header-interaction.test.ts tests/unit/lib/system-resources-ui.test.ts tests/unit/lib/visual-viewport.test.ts tests/unit/lib/region-typography.test.ts tests/unit/lib/layout-close-pane-focus.test.ts tests/unit/lib/layout-tab-creation-client.test.ts` | 48 项通过，含新增 4 项：侧栏挤占/恢复、临界稳定性、资源与 Git 宽度变化、加载后挂载及 observer 清理 |
| 完整 TypeScript | `pnpm exec tsc --noEmit` | 通过 |
| 改动文件 ESLint | `pnpm exec eslint src/hooks/use-header-space.ts tests/unit/lib/header-space.test.ts src/components/features/workspace/terminal-page.tsx src/components/features/workspace/content-header.tsx` | 通过 |
| 浏览器尺寸 | agent-browser 会话 `tab-header-width-fix`；800×700 视口，内容区 320/400/480/640/800px × 标签字号 12/40px | 10 组通过；320/400px 内容区分别保留 246/326px 标签列表，新建按钮中心命中真实按钮，行无横向溢出；640/800px 恢复合并 |
| 临界宽度 | 本次夹具测得阈值 561px，560/561px 往返 | 4 组通过，无持续合并/恢复循环；合并时标签列表保留 146px，另有箭头和新建入口 |
| 浏览器交互 | 窄内容区切换第二个标签、新建 Web Browser；资源和编辑器开关、Git 状态宽度增大、分屏/关闭、Git 开关 | 全部通过；新建后标签从 12 增至 13，无浏览器错误 |

浏览器命令：`node /tmp/tab-header-width-fix/build.cjs` 编译当前真实组件及 Hook，`node /tmp/tab-header-width-fix/server.cjs` 启动 `http://127.0.0.1:18358`，`python3 /tmp/tab-header-width-fix/verify.py` 执行检查。尺寸以组件容器模拟侧栏挤占，未操作完整应用的真实侧栏；TerminalPage 的条件连接通过源码及类型检查核对，浏览器夹具复用同一 Hook、ContentHeader、PaneTabBar 和布局分支。API、正文和部分路由组件沿用固定夹具。

本次证据：[400px 内容区修复截图](./result/narrow-content-fixed.png)、[14 组尺寸与交互检查结果](./result/narrow-content-results.json)。初次实施结果保留为历史记录，本节为修复后的实际结果。未重跑移动设置矩阵、生产构建及 Electron/手机实机检查。

## 验证边界

- 浏览器为组件夹具，未冒充完整应用端到端测试：真实工作区加载、分屏终端连接、拖拽、编辑器外部启动和 Git 内容加载未实测。
- 保留 Electron 独立拖动栏并检查源码；Electron 实机、手机安全区及软键盘未实测。可用视口已有 Hook 测试通过。
- 未执行完整生产构建；初次实施通过 44 项单测，评审修复后本次通过 48 项单测，均另有完整类型检查、ESLint 和真实组件浏览器编译/验证。
- 未提交、推送或发布。
