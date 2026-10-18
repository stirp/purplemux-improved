# 验证记录

日期：2026-10-18。环境：Linux、Next.js 16.2.6 开发服务、Chromium；使用独立 agent-browser 会话和临时测试文件。

## 自动化检查

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 相关回归 | `pnpm exec vitest run tests/unit/lib/file-preview.test.ts tests/unit/lib/session-file-links.test.ts tests/unit/lib/editor-file-link.test.ts tests/unit/lib/session-files.test.ts tests/unit/api/session-files.test.ts tests/unit/lib/markdown-code-block.test.ts tests/unit/lib/uploads-proxy.test.ts` | 7 个文件、81 项通过；PDF 修正后重新执行 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 改动文件 ESLint | `pnpm exec eslint src/lib/session-file-url.ts src/lib/session-files.ts src/components/features/timeline/editor-file-link.tsx src/pages/file-preview.tsx 'src/pages/api/session-files/[...path].ts' tests/unit/lib/file-preview.test.ts tests/unit/lib/editor-file-link.test.ts tests/unit/lib/session-file-links.test.ts tests/unit/api/session-files.test.ts` | 通过 |
| 差异格式 | `git diff --check` | 通过 |
| 未认证预览页面 | 无 Cookie 请求 `/file-preview?file=…` | 307 跳转 `/login` |

## 验收对应

| 条款 | 本次证据 |
| --- | --- |
| PN-01 | 回复和计划组件测试覆盖预览 URL、来源参数、当前页打开；桌面编辑器和普通链接回归通过 |
| PN-02 | URL/页面测试覆盖来源及外站、重复参数、非法来源回退；浏览器点击返回后地址为 `/?previewCheck=1`，测试用 sessionStorage 标记仍在。验证了导航及标签存储保留，未声称完整 Agent 会话恢复已通过 |
| PN-03 | 320×740 长文件名、深色文本页面无横向溢出；返回入口 78×44px，文件名可用宽度 206px；390×844 浅色 HTML 也无横向溢出。滚动 iframe 至 1000px 后返回入口顶部仍为 8px |
| PN-04 | 文本第 100 行定位和高亮；HTML 相对 SVG 宽 300px、CSS 背景 `rgb(244,245,247)`，测试脚本未执行；SVG 图片、PDF 原生阅读器显示正常；文件不存在时 iframe 显示错误但外层返回入口仍在 |
| PN-05 | 上述测试、类型检查、ESLint 与浏览器检查通过 |

截图：[320px 文本](./text-320.png)、[320px PDF](./pdf-320.png)、[390px HTML](./html-390.png)、[390px 图片](./image-390.png)。

## 限制与过程记录

- 首次浏览器检查发现 sandbox 会禁用 Chromium PDF 插件，修正后重新截图确认原生阅读器正常，并重跑自动化检查。
- 首次返回主页编译期间本地验证进程中断；重新启动开发服务和独立浏览器会话后完成剩余检查。未把中断当作通过。
- 仅验证 Chromium 窄屏，未执行 iOS/Android 实机及真实 Agent 会话从点击到恢复的完整端到端验收；未验证不同手机浏览器的原生 PDF 插件差异。
- 本次采用开发服务的实际浏览器检查，未执行生产构建、发布、Git 提交或推送。
- 安装的 agent-browser 不提供 `skills get core` 内容，使用已读取的本地 core 技能指南及 CLI help 完成检查。
