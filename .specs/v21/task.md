# v21 任务进度

## Agent 会话标题同步（2026-10-14）

- [x] 定义活动会话标题与手动 Tab 名称的展示优先级。
- [x] Tab 与 Sessions 活动项复用会话元数据标题。
- [x] 手动重命名写入持久会话标题，并同步会话详情与历史会话列表。
- [x] 类型检查、相关测试、改动文件 ESLint 和 diff 检查通过。
- [ ] 浏览器验收，见[验证记录](./result/verify-agent-session-titles.md)。

见[需求](./requirements/agent-session-titles.md)和[实施记录](./result/build-agent-session-titles.md)。

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
