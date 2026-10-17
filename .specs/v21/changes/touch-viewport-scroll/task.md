# 触屏视口滚动约束后续修正

延续[原需求](../../requirements/touch-viewport-scroll.md)与[原规格](../../features/workspace-viewport/spec.md)，不修改版本共享任务表。

- [x] 补充 iPad iOS 15.6 侧栏滑动与负视口偏移验收约定。
- [x] 实现侧栏触摸边界兼容与视口偏移保护。
- [x] 相关回归测试 91 项、完整 TypeScript、改动文件 ESLint 及隔离浏览器触摸验证通过。
- [x] P1 Review 修正：提前记录触摸起点；两个真实 hook 的集成回归先复现失败再通过，相关测试共 99 项及类型、ESLint 检查通过，浏览器验证边界滚动、长按菜单和拖放。
- [ ] iPad iOS 15.6 实机复验（当前环境无该设备）；完整应用及软键盘实机验收未执行。

证据：[实施](../../result/build-touch-viewport-scroll.md)、[验证](../../result/verify-touch-viewport-scroll.md)。
