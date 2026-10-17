# 实施记录

## 变更入口

- `src/components/features/timeline/editor-file-link.tsx`：复用现有路径解析、会话 cwd、移动设备及窄屏判断。手机或无可用编辑器时输出普通网页锚点，桌面已有编辑器继续沿用原跳转；回复与计划共用入口。
- `src/lib/session-file-url.ts`：统一逐段编码文件路径、view 参数及行号片段，不把本地路径当作浏览器机器上的文件。
- `src/lib/session-files.ts`：普通文件读取、真实路径范围检查、类型映射、静态 HTML 安全策略、文本转义及窄屏阅读页面。
- `src/pages/api/session-files/[...path].ts`：浏览器/CLI 双认证，工作区和临时目录范围，有限文本预览与原文件流式响应，错误状态及资源释放。
- `src/proxy.ts`：显式保护文件接口的所有扩展名；未认证 API 响应不缓存。
- 新增文件系统、HTTP 和移动交互测试，扩展现有编辑器链接和 proxy 测试。

## 实现决策

- 初次实现的 KISS/YAGNI：不新增依赖、配置项、数据迁移、文件索引或分享服务。Markdown 显示源文；HTML 提供静态预览。后续 macOS 适配增加的原生依赖见下文。
- DRY：两种 Agent 及计划沿用同一个链接组件，编辑器解析和认证复用已有工具。
- 单一职责：URL 构造、文件系统与展示策略、HTTP 编排分离，原差异/目录编辑器入口无行为改动。
- 浏览器检查发现 sandbox opaque origin 会让相对资源缺少 SameSite Cookie，实际产生 `ERR_BLOCKED_BY_ORB`。已在编码修正前更新规格：HTML 使用 `sandbox allow-same-origin`，不开放脚本；资源仅允许本文件接口、内联样式和内嵌图片。

## 边界

- 网页链接需访问者登录同一服务，且手机能够访问服务地址；未增加匿名外链。
- 服务端已配置工作区及系统临时目录之外的文件被拒绝。链接读取当前文件，不保留历史快照，临时文件删除后不可访问。
- HTML JavaScript、外部 CDN、网络请求和表单不运行；未知格式下载，文本预览大于 2 MiB 返回 413。
- 未进行 Git 提交、推送或部署。

## 评审修正：文件路径边界

- 删除 `openSessionFile` 在 realpath 之前对原始根目录字符串的判断；范围判断使用规范化后的根目录和目标，因此符号链接工作区的真实路径不再被提前拒绝。
- 打开后直接 `readlink(/proc/self/fd/<fd>)` 获取内核记录的实际文件位置，再与允许根目录比较。避免把该链接再交给 realpath 解析，或重新 stat 可变路径。通过检查后，HTTP 仍从同一个 FileHandle 读取。
- 父目录替换导致实际描述符指向范围外文件时返回 403 并关闭句柄；即使打开后恢复父目录，也不会被路径外观欺骗。未取得可验证的描述符路径时返回 503 并关闭句柄。
- 首次修正复用原 `try/catch` 资源释放及 `SessionFileError` 响应流程，不新增依赖或接口。当时依赖 Linux procfs；其 Linux-only 限制已由下方 macOS 适配替代，仍不允许不安全回退。
- 授权范围仍为原有工作区和系统临时目录。本次修正不等于完成单产物授权、文件导出目录隔离或多用户权限设计。

## macOS 支持扩展

用户在确认仅 Linux 后再次明确要求支持 Mac，因此沿用本需求继续扩展，不创建重复规格。

- `src/lib/opened-file-path.ts` 封装操作系统适配。Linux 保留 procfs；macOS 按需加载 Koffi，调用 `/usr/lib/libSystem.B.dylib` 的变参 `fcntl`，使用 Darwin `F_GETPATH = 50` 及 `PATH_MAX = 1024`，直接取得已打开描述符的路径。校验返回状态、NUL 结尾及 UTF-8，不接受空值或截断输出。
- `session-files.ts` 复用原有范围判断和句柄释放；平台适配失败仍转换为 503，所有读取继续使用同一个已验证 FileHandle。
- 新增精确版本依赖 `koffi@2.15.2`，该版本随包提供 macOS arm64、x64 预编译模块，避免首次访问时编译或依赖外部 Python。`pnpm-workspace.yaml` 明确禁用其安装构建脚本，已验证预编译模块可直接加载；锁文件仅增加 Koffi 条目，保留原有依赖版本及 peer 解析。
- `next.config.ts` 将 Koffi 设为服务端 external；`scripts/post-build.js` 的 Electron 依赖补齐名单增加 Koffi，沿用既有 `.next/standalone/**` 解包规则。Web 模式通过正式 dependencies 安装并解析库。Koffi 带预编译文件及源码，会增加安装包/依赖体积。
- 产物检查复现了 Next.js 将 `process.platform` 和静态导入的 `os.platform()` 折叠为构建机平台的行为，初版 Linux 产物中 Mac 分支被移除。改用 Node `getBuiltinModule('node:os')` 在运行时取得平台查询函数，避免 Linux 发布流水线生成的 npm 包丢失 macOS 适配。
- 新增平台模拟测试和不模拟底层调用的原生测试；原有真实文件系统竞态测试在两种平台共用。`.github/workflows/session-file-access.yml` 配置 Ubuntu、macOS 默认架构、macOS Intel 三种 runner。
- 单一职责：操作系统差异集中在描述符路径适配器，访问策略仍留在原模块；两种平台共用边界检查及失败处理。

参考：[Apple fcntl.h](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/fcntl.h)、[Apple syslimits.h](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/syslimits.h)、Koffi 包内 `doc/pages/functions.md`、`doc/pages/pointers.md`、`doc/pages/packaging.md`。

## PR #58 修正：文本预览增长竞态

- 对应[评审意见](https://github.com/stirp/purplemux-improved/pull/58#discussion_r4303201483)：原缓冲区受 stat 旧大小限制，文件随后增长会导致静默截断，超过 2 MiB 也无法检测。
- 文本预览改为固定上限加 1 字节的缓冲区，从同一个已核验 FileHandle 循环读取至 EOF 或缓冲区满。累计读取超过上限返回 413；单次短读继续读取，恰好 2 MiB 仍可预览。初始 stat 的超限快速拒绝保留。
- 复用现有错误响应与 finally 句柄释放，不新增依赖或平台分支（KISS/DRY）。每个文本预览请求最多分配 2 MiB + 1 字节读取缓冲区；不承诺并发改写期间的快照一致性。
- HTTP 测试新增 8 项：空文件、从零增长、限内增长、恰好上限、增长超限、限内/超限短读、读取失败。使用真实临时文件，在安全打开完成后追加内容；短读测试限制每次读取 64 KiB，同时验证累计读取上限和句柄关闭。
