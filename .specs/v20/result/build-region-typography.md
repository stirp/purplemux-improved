# 区域字体实施记录

- 日期：2026-10-03
- 对应规格：[region-typography](../features/region-typography/spec.md)
- 实施状态：代码已实现；未提交、未发布

## 实现入口

- `src/components/features/settings/region-typography-settings.tsx`：独立区域编辑器、预览和保存反馈。
- `src/components/features/workspace/settings-dialog.tsx`：外观页入口。
- `src/lib/region-typography.ts`：区域模型、共享校验和受限 CSS 生成。
- `src/lib/config-store.ts`、`src/pages/api/config.ts`：配置持久化字段和 API 校验。
- `src/hooks/use-config-store.ts`：旧配置恢复、成功后更新及配置同步。
- `src/hooks/use-sync.ts`：配置广播、重连与可见性恢复接线。
- `src/pages/_app.tsx`：区域样式同步。
- `sidebar.tsx`、`tab-bar.tsx`、`pane-tab-bar.tsx`、`timeline-view.tsx`、`web-input-bar.tsx`：区域标识。
- `src/hooks/use-terminal.ts`：xterm 动态字体、字号、前景色和字体加载后尺寸重算。
- `messages/*/settings.json`：区域设置文案。
- `tests/unit/lib/region-typography.test.ts`：配置验证及失败、恢复默认、同步回归。

## 实现原则

复用已有配置 API、文件写入与同步连接，避免另建持久化服务。
区域编辑器独立负责交互，共享模块统一校验与样式生成。
仅实现本次五个目标区域，不加入字体上传或每工作区配置。

## 规格回补

本次先实现功能，后补齐需求、规格和详情，依据用户要求写入 AGENTS.md 开发约束。
PRD 和任务表同步关联此需求，不改写既有历史验收记录。
验证证据和未执行项见[验证记录](./verify-region-typography.md)。

## Review 修复实施（2026-10-03）

先补充 RT-10 至 RT-17 和 UI/flow/API 行为约定，再进行本次修复。

- `terminal-appearance.ts` 比较实际主题颜色，仅变化时设置并显式刷新；`use-terminal.ts` 复用此逻辑。
- 无效颜色改为错误占位，暂停原生选择器；恢复合法文本后重新显示选择器。
- UI 和 store 共享顺序无关配置比较，空区域与缺失区域等价；等价保存不发送 PATCH。
- 同步合并为单个在途 GET 与一次待刷新请求；代际和保存状态防止旧响应回退已保存配置。
- action 取消重复本地拒绝，解析服务端错误详情；面板保留草稿并显示详情。
- 两种样式通过 `use-custom-style.ts` 统一 effect 注入，更新、清空和卸载均清理旧节点。
- 字体或字号变化时标签栏使用 normal 行高、内容高度和内边距，取消固定小行盒约束。
- 增加 jsdom 26.1 测试开发依赖，兼容项目 Node 20 基线；保留已有直接依赖锁定版本。
- 增加 React/DOM 交互、StrictMode 样式生命周期、终端 hook 与并发配置回归测试。

### 复核澄清

当前 xterm 6 的 `RenderService.ts` 已订阅 `themeService.onChangeColors` 并调用 `_fullRefresh()`，
不能仅凭业务 effect 缺少 refresh 就证明当前版本必然不重绘；本次增加显式刷新保障和回归。
`useMemo` 也不会无条件每次渲染产生新对象，仅在依赖变化时重新计算；
本次增加实际主题值比较，避免等值新对象造成重复设置。
原字体加载回调已有取消及实例检查，本次补充卸载回归验证，而非宣称原守卫不存在。

## 架构复审实施（2026-10-05）

先补充 RT-18 至 RT-23，再调整实现，替换 2026-10-03 的局部架构。

- store 恢复原有扁平 create 初始化，两个模块级变量分别记录 GET 在途 Promise 和最新快照时间；不再有四变量区域状态机。
- config-store 写入保持单调 updatedAt，updateConfig 返回已保存数据；GET、保存响应和广播共用 public-config 安全投影，排除认证密码和密钥。
- 配置广播直接携带完整快照；use-sync 调用通用 hydrate，不再只更新区域字段；重连/可见性恢复用 syncConfig。
- 应用主题和终端主题增加 ConfigThemeSync 桥接；语言、字号、CSS 等复用现有 store 消费点。
- 注入 CSS 仅设置 :root 的区域变量，组件使用区域类和 globals.css 消费规则；无标签允许列表、无 !important、无注入布局规则。
- 标签栏所有正常/错误/加载分支均使用区域类，分别保留 30/36 px min-height；正常内容垂直内边距归组件管理。
- useTerminal 不订阅任何 store，仅接受 props；桌面和移动端调用处使用 resolveTerminalTypography 明确解析覆盖，安装登录终端保留自身设置。
- 区域变量 style 保持在用户 CSS 之前，更新不移动已有节点；恢复默认后再次应用也保持顺序。

未配置字段通过直接属性中的 `var(..., revert-layer)` 回到 Tailwind 层；避免在中间自定义属性中使用 CSS-wide fallback。
该模式有 CSS Variables 的 [WPT 标准用例](https://github.com/web-platform-tests/wpt/blob/master/css/css-variables/revert-layer-in-fallback.html)，本次未执行真实浏览器布局测试。
