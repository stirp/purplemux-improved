# 实施记录

## 根因与影响

2026-10-16：读取旧浏览器兼容和 Worktree 基线后，编译现有全局 CSS，确认 Tailwind 将 `bg-destructive/10` 的旧浏览器规则输出为 `background-color: var(--destructive)`，仅在 `@supports (color: color-mix(...))` 内保留 10% 透明度。按钮前景为同一个 `--destructive`，Safari 15.6 不支持增强规则，因此表现为红色矩形而看不到文字。

同类风险包括共用危险按钮的单个/批量 Worktree 删除、历史会话删除、清理存储、终止操作，以及危险菜单聚焦、工作区等待状态、Git NEW/DEL/RENAME 标签、审批/计划/问题卡片、设置标签和其他语义色提示。文字与翻译本身均存在，未发现需要更改文字内容的证据。

## 变更入口

- `scripts/postcss-alpha-fallback.cjs`：在 Tailwind 转换完成后读取变量颜色，按实际使用的透明度生成派生变量。变量留在原主题作用域，别名继续引用，原有 alpha 相乘；旧浏览器分支保留选择器、媒体条件和层叠位置，现代增强保持原值。
- `postcss.config.mjs`：开发/生产均加载公共插件；使用绝对路径兼容 Turbopack 从 `.next/build` 加载插件的方式。
- `tests/unit/lib/css-browser-compatibility.test.ts`：使用实际 PostCSS 配置，覆盖开发/生产产物、内置变量混合的完整枚举、主题、别名、已有 alpha、小数透明度和未知/循环/运行时终端变量边界。

遵循 DRY，将同类修复集中在构建层，未逐个组件追加选择器或改变操作逻辑；遵循 KISS/YAGNI，仅转换当前 Tailwind 输出的变量颜色与透明色混合，没有增加运行时观察器、浏览器嗅探或依赖。沿用已有百分比 OKLCH、媒体查询、嵌套和平滑前缀转换。

## 边界

- 内置 OKLCH/OKLab、十六进制和变量别名适用；用户运行时注入的任意 CSS 不自动推导派生颜色。
- `--terminal-*` 由运行时终端主题覆盖，保持原有兼容规则，避免静态颜色覆盖运行时选择。
- 仅完成本地实现与验证，未执行 Git 提交、推送或发布。`DETAILED` 只代表规格详情完成。

验证结果见[验证记录](./verify.md)。
