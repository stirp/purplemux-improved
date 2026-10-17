# 验证记录

日期：2026-10-17。规格已写、代码已实现；以下结果均为本次运行。

## 自动化检查

| 检查 | 命令或范围 | 实际结果 |
| --- | --- | --- |
| 相关测试 | `pnpm exec vitest run tests/unit/api/session-files.test.ts tests/unit/lib/session-files.test.ts tests/unit/lib/session-file-links.test.ts tests/unit/lib/editor-file-link.test.ts tests/unit/lib/editor-url.test.ts tests/unit/lib/uploads-proxy.test.ts tests/unit/lib/markdown-code-block.test.ts tests/unit/lib/markdown-browser-compatibility.test.ts` | 8 个文件、91 项通过 |
| proxy 最后变更回归 | `pnpm exec vitest run tests/unit/lib/uploads-proxy.test.ts tests/unit/api/uploads-auth.test.ts` | 2 个文件、22 项通过；包含新增未认证响应 no-store 检查。两组去重共 98 项 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过；初次新增 HTTP 测试适配类型断言报错，已修正并重跑 |
| ESLint | `pnpm exec eslint` 指定下列全部变更 TS/TSX 文件 | 通过 |
| 生产构建 | `pnpm build` | Next.js 16.2.6 构建、post-build、tsup 均通过；产物含 `/api/session-files/[...path]` |
| 差异格式 | `git diff --check` | 通过 |

ESLint 文件范围：

- `src/lib/session-file-url.ts`
- `src/lib/session-files.ts`
- `src/pages/api/session-files/[...path].ts`
- `src/components/features/timeline/editor-file-link.tsx`
- `src/proxy.ts`
- `tests/unit/lib/session-files.test.ts`
- `tests/unit/api/session-files.test.ts`
- `tests/unit/lib/editor-file-link.test.ts`
- `tests/unit/lib/session-file-links.test.ts`
- `tests/unit/lib/uploads-proxy.test.ts`

## 验收映射

| 条件 | 本次证据 |
| --- | --- |
| FW-01 | 组件测试覆盖窄屏、移动设备、编辑器关闭、桌面编辑器、普通 HTTP；JSDOM 验证真实锚点默认行为以及计划弹窗内 cwd 解析 |
| FW-02 | 路径解析回归及网页 URL 测试覆盖中文、空格、特殊字符、相对路径、file URI、行列后缀 |
| FW-03 | 真实临时文件 + HTTP server 测试验证文本转义、行号、HTML、相对图片、PDF/CSS MIME、二进制下载及流式字节；浏览器检查文本和静态 HTML |
| FW-04 | 文件系统测试验证 realpath、符号链接内外边界、前缀碰撞、非法片段、目录和不存在；接口测试覆盖认证、405、413、403；proxy 匹配覆盖图片及字体后缀 |
| FW-05 | 上述测试、类型、lint 和构建通过；最终生产产物浏览器复验通过 |

## 浏览器检查

使用独立 `agent-browser` 会话 `ai-file-web-access`，Chromium 147，390×844；服务仅监听 `127.0.0.1:8327`。最终验证运行 `.next/standalone/server.js` 生产产物，使用本次专用测试签名密钥与有效 HttpOnly、SameSite=Lax Cookie，不读取或修改正式登录密钥。

- 文本：中文文件名可打开；长行不产生页面横向溢出；`#L3` 定位并高亮；源文中的 `<script>` 仅显示为文字，DOM 无脚本节点。截图：[手机文本预览](./mobile-text.png)。
- HTML：相对 SVG 图片 `naturalWidth = 300`；相对 CSS 应用后背景为 `rgb(244, 245, 247)`；页面无横向溢出。内联脚本未执行，点击测试按钮也未运行事件处理器。截图：[手机静态 HTML 预览](./mobile-html.png)。截图中的按钮是用于验证脚本禁用的测试内容。
- 认证：不带 Cookie 请求 SVG，实际返回 `401 Unauthorized`、`cache-control: no-store`；认证保护未因图片后缀失效。
- 初次浏览器检查发现 opaque-origin sandbox 下相对资源被 ORB 阻止；已更新规格及实现，最终截图和数据来自修正后的生产构建。

## 限制和未执行项

- 未在 iOS Safari、Android 实机上验收；未启动真实 Claude/Codex 生成文件并完整点击。两者的共用回复及计划入口由组件测试覆盖。
- PDF 仅验证响应类型，未验证各手机浏览器内置 PDF 阅读器；其他格式是否可打开或下载依赖浏览器原生支持。
- HTML 为静态预览，不执行 JavaScript、不加载外部 CDN；Markdown 为源文，不转换为排版后的 Markdown。
- 未执行全仓库测试、部署或发布；构建和浏览器测试服务均为本地验证。

## 评审修正验证：文件路径边界

本节为本次“修复问题”的新运行证据，上文保留初次实现的历史记录。

| 检查 | 命令/场景 | 结果 |
| --- | --- | --- |
| 修复前回归 | `pnpm exec vitest run tests/unit/lib/session-files.test.ts` | 13 项通过、3 项失败；真实路径误拒绝和两种父目录替换均在旧实现上复现 |
| 修复后相关测试 | `pnpm exec vitest run tests/unit/lib/session-files.test.ts tests/unit/api/session-files.test.ts` | 26 项通过 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 改动文件 ESLint | `pnpm exec eslint src/lib/session-files.ts tests/unit/lib/session-files.test.ts` | 通过 |
| 生产构建 | `pnpm build` | Next.js、post-build、tsup 均通过 |
| 文档及差异 | 需求目录 Markdown 链接检查、`git diff --check` | 通过 |

FW-06 覆盖：

- 同一个符号链接工作区，分别使用配置别名与真实路径，读取内容均正确。
- 在 realpath 校验后、真实 open 前，将父目录改名并替换为范围外目录的符号链接；实际打开外部文件后，必须拒绝返回，并验证句柄已关闭（EBADF）。
- 上述攻击在 open 后立即恢复原父目录，再执行描述符核验，仍返回 403 并关闭句柄。
- 模拟 procfs 读取失败，返回 503 并关闭句柄；不得返回未经核验的文件内容。
- 原有符号链接内外边界、前缀碰撞、非法参数、普通文件检查、认证与文件内容 HTTP 测试保持通过。

该次修正仅修改服务端文件打开逻辑，未重新执行浏览器验收。当时仅验证 Linux，其他平台返回 503 的限制已由下方 macOS 扩展替代。仍需保留对原有较宽目录授权范围的风险认识。

## macOS 支持扩展验证

以下为用户追加 Mac 支持后的本次运行证据，不把模拟平台调用当作 macOS 实机验证。

| 检查 | 命令或方法 | 结果 |
| --- | --- | --- |
| 可复现安装 | `pnpm install --frozen-lockfile`，Koffi 构建脚本禁用 | 通过；依赖自带预编译模块可加载 |
| 平台及安全回归 | `pnpm exec vitest run tests/unit/lib/opened-file-path.test.ts tests/unit/lib/opened-file-path-native.test.ts tests/unit/lib/session-files.test.ts tests/unit/api/session-files.test.ts` | 4 个文件、41 项通过 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 改动文件 ESLint | 平台适配器、session-files、对应三份测试、next.config.ts | 通过；post-build 默认被仓库忽略，另用 `pnpm exec eslint --no-ignore scripts/post-build.js` 检查通过 |
| 构建脚本语法 | `node --check scripts/post-build.js` | 通过 |
| Electron 构建流程 | `pnpm build:electron` | Next.js、Electron post-build、服务端 tsup、Electron tsup 全部通过（Linux 上构建，未生成或签名 Mac 安装包） |
| Electron 依赖完整性 | 从 standalone 解析 Koffi，比较其 Darwin 二进制与源依赖的字节 | arm64 4,025,399 字节，x64 4,320,672 字节，均一致；standalone 中 Koffi 的 Linux 原生调用 smoke test 通过 |
| Web 构建模式 | 在相同 Next.js 生产产物上执行 `node scripts/post-build.js`，从 Koffi external shim 解析安装依赖 | 通过；无 standalone/node_modules 时仍解析到正式安装依赖，Linux 原生调用 smoke test 通过 |
| 跨平台产物 | 检查服务端编译产物保留运行时平台判断及 Darwin F_GETPATH 调用 | 前两次检查发现 process.platform 及静态 os.platform 都被折叠；改用 getBuiltinModule 后重新构建，最终 Web/Electron 产物保留 Mac 分支 |
| 生产接口运行时分发 | 启动最终 standalone 产物，以专用测试 Cookie 请求临时文件；运行时模拟 Darwin，并将 F_GETPATH 替换为 Linux 描述符查询 | HTTP 200、内容正确、确认实际调用了 Darwin 适配器；测试服务及临时文件已关闭/清理。这是 Linux 上的构建产物兼容性验证，不是 macOS 系统调用实测 |
| 文档与差异 | 需求目录链接检查、`git diff --check` | 通过 |

FW-07 的模拟测试检查：Linux 不加载原生库；Darwin 使用同一个 fd、变参签名、F_GETPATH 和足够缓冲区；原生错误、缺失库、无 NUL/空路径/非法 UTF-8 均失败，不回退路径读取；非法描述符与不支持平台均拒绝。

原生测试不模拟平台或底层库，检查中文路径、目录改名/替换后描述符仍指向原文件、已关闭 fd 拒绝；这部分本次在 Linux 运行。既有竞态用例也继续验证越界拒绝与句柄关闭。

`.github/workflows/session-file-access.yml` 已增加 `ubuntu-latest`、`macos-latest`、`macos-15-intel` 测试入口，尚未提交或触发 CI。macOS 的真实 F_GETPATH、Apple Silicon/Intel ABI、DMG/ZIP 签名及安装后运行仍待 Mac 环境执行，不能称为已通过实机验收。本次无界面改动，未重跑浏览器检查。
