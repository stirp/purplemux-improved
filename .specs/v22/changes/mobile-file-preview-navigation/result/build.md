# 实施记录

日期：2026-10-18。

- `src/pages/file-preview.tsx`：新增经过认证的预览页面，复用本地化“返回”、现有按钮样式和主题。顶部触控入口至少 44px，长文件名省略，内容独立滚动；无效请求仍显示返回入口。
- `src/lib/session-file-url.ts`：保留原文件 URL 构造，增加预览地址及来源地址校验。来源仅接受应用首页、查询参数和 hash；缺失或非法值回退 `/`。
- `src/components/features/timeline/editor-file-link.tsx`：回复与计划共用入口改为当前标签打开预览，以保留已有 sessionStorage 工作区/会话选择；桌面编辑器和普通网页链接保留原行为。
- `src/lib/session-files.ts`、`src/pages/api/session-files/[...path].ts`：文本和 HTML/SVG 的 CSP 允许同源页面内嵌，保留脚本禁用及原有资源限制。文本行号继续传给 iframe URL。
- HTML/SVG/文本 iframe 保持 sandbox；PDF 依赖接口固定的 PDF MIME 与浏览器原生阅读器，不设置会禁用 Chromium PDF 插件的 iframe sandbox。
- 新增页面与 URL 回归测试，更新原有链接和文件响应测试。

KISS/YAGNI：仅增加一个预览页面，无新依赖、配置或数据迁移。DRY/SOLID：共享 URL 工具和链接组件负责入口，页面负责导航外壳，现有 API 继续负责认证与文件读取，不复制读取逻辑。
