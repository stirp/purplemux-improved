# 验证记录

日期：2026-10-16。规格：[iOS 15.6 半透明颜色与文字可见性修复](../spec.md)。

## 自动化和构建

| 检查 | 本次结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/css-browser-compatibility.test.ts` | 4 项通过，包含开发和生产全量 CSS 编译 |
| `pnpm exec tsc --noEmit` | 通过，完整项目检查 |
| `pnpm exec eslint postcss.config.mjs tests/unit/lib/css-browser-compatibility.test.ts` | 通过 |
| `pnpm exec eslint --no-ignore scripts/postcss-alpha-fallback.cjs` | 通过；显式检查默认忽略的 scripts 目录 |
| `pnpm build` | 通过，Next.js/Turbopack、静态页面生成、post-build 与 tsup 完成 |
| 最终 `.next/static/chunks/0et4u6is_~hyh.css` 检查 | 包含 177 处旧浏览器透明色降级；未发现不兼容的数字 OKLCH 亮度 |
| `git diff --check` | 通过 |

过程中发现并修正：全量 CSS 编译与构建并行时曾超过测试原 5 秒时限，改为 30 秒后通过；首次构建因 Turbopack 插件相对路径解析失败，改为绝对路径后完整构建通过。上述失败未当作验收通过。

## 浏览器能力模拟

使用 `agent-browser` 独立会话、Chromium 1024×768 视口。临时验证页通过 React 服务端渲染仓库真实 `Button` 组件，并组合来自状态、差异标签、审批/计划等现有类名的样例；不调用删除等业务接口。

以 PostCSS 移除支持 `color-mix()` 的增强分支，并展开不支持分支，模拟旧浏览器选择的 CSS；未用修改 UA 代替能力模拟。先对原样式复现，再对修复后样式验证，最后换成 `pnpm build` 的最终 CSS 再检查浅色和深色。现代路径使用未经处理的最终 CSS。

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 浅色危险按钮 | 前景、背景均为同一个不透明红色 | 前景保留，背景 alpha 0.1 |
| 深色危险按钮 | 同类不透明降级风险 | 背景 alpha 0.2，文字可见 |
| 禁用危险按钮 | 同色问题 | 背景 alpha 保留，元素 opacity 仍为 0.5 |
| 等待状态、NEW/DEL/RENAME | 前景与背景同色 | 背景 alpha 0.15，文字可见 |
| 审批、计划提示 | 前景与背景同色 | 背景分别 alpha 0.05、0.1 |
| 设置标签、辅助说明 | 标签前景背景同色；说明透明度丢失 | 标签背景 alpha 0.1，说明前景 alpha 0.7 |
| 现代浏览器 | 原 color-mix 行为 | 继续计算为 OKLab 混合，浅/深色 alpha 分别 0.1/0.2 |

生产产物在最终优化中将部分固定 OKLCH 色转为 Lab，实际读取到浅色按钮背景 `lab(48.4493 77.4328 61.5452 / 0.1)`、深色背景 `lab(63.7053 60.745 31.3109 / 0.2)`，透明度仍正确。

截图：[修复前浅色](./before-light.png)、[生产产物修复后浅色](./after-light.png)、[生产产物修复后深色](./after-dark.png)。

## 验收映射与限制

1. 危险按钮透明度与主题：开发/生产编译测试及最终 CSS 浏览器模拟通过。
2. 同类文字覆盖：枚举内置变量混合、代表性组件截图及计算样式通过。hover/focus 的选择器和条件由编译测试检查；浏览器当前为无 hover 能力环境，未声称实际鼠标悬停验收通过。
3. 别名、alpha 相乘及现代增强：自动化与计算样式通过。
4. 嵌套、媒体查询、百分比亮度及前缀：保留并通过原兼容测试。
5. 类型、ESLint、构建及浏览器能力模拟：通过。

未执行 iPad iOS 15.6 实机或对应历史 WebKit 验证，能力模拟不能替代实机验收；未执行完整业务端到端删除流程。运行时自定义 CSS 的任意颜色覆盖不属于本次保证范围。
