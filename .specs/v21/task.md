# v21 任务进度

## Sessions 查询（2026-10-15）

- [x] 补充每条会话项目名称必显；统一名称回退、历史和较早记录展示、长名称换行。后续 73 项测试、完整 TypeScript、ESLint 及桌面/320px 组件浏览器验证通过，见验证记录补充节。
- [x] 定义查询范围、匹配规则、临时展开和清空恢复行为。
- [x] 实现共用面板搜索及针对性回归测试。
- [x] 66 项相关测试、完整 TypeScript、改动文件 ESLint、11 种语言文案及 diff 检查通过；真实组件桌面/320px 浏览器检查通过，见[验证记录](./result/verify-session-search.md)。
- [ ] 完整应用端到端及移动设备实机验收；本轮浏览器使用模拟数据，未执行生产构建。

见[需求](./requirements/session-search.md)、[规格](./features/session-search/spec.md)和[实施记录](./result/build-session-search.md)。

## PR #38 交互审查修正

- [x] 明确首次菜单点击、隐藏齿轮键盘可达性和原生鼠标拖动隔离的验收条件。
- [x] 修复三项审查问题；43 项相关测试、完整 TypeScript、改动文件 ESLint、生产构建和 diff 检查通过。浏览器验证首次菜单点击、coarse 布局 Tab/无障碍树及原生鼠标拖动隔离；见[本轮证据](./result/verify-worktree-tree.md)。

## 根入口、树层级与项目长按（2026-10-14）

- [x] 补齐根管理按钮、树连接线、按需齿轮及长按分流规格。
- [x] 实现桌面/移动导航与手势回归。
- [x] 61 项相关测试、完整 TypeScript、改动文件 ESLint、生产构建和 diff 检查通过；真实组件浏览器检查桌面入口/悬停/键盘与移动长按/拖动、320px 窄屏，已更新实施与验证记录。
- [ ] iOS/Android 实机手感及完整应用端到端验收；本轮浏览器使用模拟数据，见[验证记录](./result/verify-worktree-tree.md)。

## Agent 会话标题同步（2026-10-14）

- [x] 定义活动会话标题与手动 Tab 名称的展示优先级。
- [x] Tab 与 Sessions 活动项复用会话元数据标题。
- [x] 手动重命名写入持久会话标题，并同步会话详情与历史会话列表。
- [x] 类型检查、相关测试、改动文件 ESLint 和 diff 检查通过。
- [ ] 浏览器验收，见[验证记录](./result/verify-agent-session-titles.md)。

见[需求](./requirements/agent-session-titles.md)和[实施记录](./result/build-agent-session-titles.md)。

## PR #37 主工作树发布（2026-10-14）

- [x] 放宽前后端发布检查中的 main，保留其他操作保护
- [x] 105 项单测、63 项 CLI 测试、完整类型检查、改动文件 ESLint 和构建通过；验证记录已更新，本轮未执行浏览器/实机验收

## 关系树多仓库与错误保留审查修正（2026-10-14）

- [x] 按子工作树仓库匹配父工作树，保留跨仓库阻断
- [x] 分离加载与合并错误，保留刷新后的失败及恢复提示
- [x] 13 项相关回归测试、完整 TypeScript、改动文件 ESLint、构建通过，验证记录已更新；本轮未执行浏览器/移动实机验收

## 变更面板提交发布快捷入口（2026-10-14）

- [x] 桌面/移动顶部文字按钮，连通已有提交和新提交的发布流程
- [x] 身份变化、无改动和提交结果不明场景测试，TypeScript、ESLint 及构建验证
- [x] 真实组件浏览器检查桌面及 390px/320px 窄屏、Changes/History 入口、提交/推送/草稿确认；Git 接口使用模拟响应，未执行真实远端发布或移动实机验收

## 工作区视口滚动约束（2026-10-13）

- [x] PR #35 Review：移除 Firefox 111 不支持的 `:has()` 选择器，改由页面外壳挂载与卸载文档作用域标记。
- [x] 桌面与移动分支的标记生命周期测试 2 项、TypeScript 和改动文件 ESLint 通过。
- [x] PR #35 修复后的生产构建与 diff 检查通过。
- [x] 补齐触屏根节点滚动边界与内部滚动验收约定。
- [x] 限制工作区文档根节点滚动，触屏设备进一步固定 body。
- [x] 完整 TypeScript、改动 TSX 的 ESLint、生产构建及 diff 检查通过。
- [ ] 桌面 Web 检查底部灰色空白；iPad/iPhone 实机检查非对话区域拖动、内部滚动与键盘切换。

见[规格](./features/workspace-viewport/spec.md)、[实施记录](./result/build-touch-viewport-scroll.md)和[验证记录](./result/verify-touch-viewport-scroll.md)。

## 下一版版本准备（2026-10-13）

- [x] 按[发布元数据规格](./features/release-metadata/spec.md)将包版本提升到 0.5.3。
- [x] 更新当前规格入口并验证版本、链接及改动。
- [ ] 构建、打包与实际安装验收（不属于本次版本准备）。

见[需求](./requirements/next-release.md)和[验证记录](./result/verify-next-release.md)。

## 项目 Worktree 父子关系与同步（2026-10-14）

- [x] 根节点入口、关系树与双向同步状态及操作
- [x] TypeScript、改动文件 ESLint、43 项相关单测与生产构建通过；浏览器/实机验收待执行

## Worktree 管理视图整合（2026-10-14）

- [x] 有子节点的根入口合一，旧能力嵌入仓库视图
- [x] TypeScript、ESLint 和 73 项相关单测通过；浏览器/实机入口验收待执行

## 单一管理入口与提交后交付（2026-10-14）

- [x] 移除行内交付按钮，统一工作区管理入口
- [x] AI 提交完成后复用推送与草稿表单并校验工作树身份
- [x] 105 项相关单测、TypeScript、改动文件 ESLint 和生产构建通过；浏览器/实机验收待执行

## 双向合并审查修正与 CLI 对齐（2026-10-14）

- [x] 方向命名与双向请求测试
- [x] 主工作树仅 merge 可执行；CLI 帮助与测试同步（浏览器/实机验收待执行）
