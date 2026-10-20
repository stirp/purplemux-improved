# 实施与验证

日期：2026-10-21。规格：[spec.md](./spec.md)。

## 根因与实施

- `next.config.ts` 未设置 Turbopack 根目录，Next.js 根据上级目录的 `package-lock.json` 选择 `/home/home`。新增 `turbopack.root: __dirname`，配置加载确认指向本项目，并保留开发磁盘缓存关闭策略。
- Next.js 16.2.6 的 `getCloneableBody().finalize()` 通过 `replaceRequestBody()` 将克隆流的属性写回原 HTTP 请求，其中包括错误监听和流销毁方法。认证 POST 请求在该步骤之后等待编译时，客户端关闭连接会触发 Node.js `abortIncoming → req.destroy(ECONNRESET)`；请求已没有错误监听，产生用户日志中的重复 `uncaughtException`。
- 修复前使用真实 Next.js 开发服务、临时进程内 CLI 令牌及完整 POST 请求，在 300 毫秒后关闭客户端，复现相同异常栈。实验记录显示 `/api/codex/launch-args` 响应关闭时，请求的错误监听数量为 0。
- `src/lib/dev-request-handler.ts` 集中管理单个开发 HTTP 请求的错误边界：提前监听请求和响应错误，并在响应关闭时补回被 Next.js 替换的请求监听；捕获处理器同步抛错及 Promise 拒绝。仅关闭连接上的 `ECONNRESET` 静默结束；其余错误记录日志，按响应阶段返回通用 500 或关闭连接。`server.ts` 的开发入口使用此包装器，生产代理保持不变。
- `src/pages/api/status/hook.ts` 的 Claude/Codex 分支改为明确的 `void` / `Promise<void>`，发送响应后不返回 `ServerResponse`。既有状态处理、认证、根会话校验及 HTTP 状态码保持原样。
- KISS/SRP：只提取请求错误边界；错误记录通过参数传入，便于隔离验证。DRY：请求、响应及异步错误共用处理逻辑。YAGNI：不添加全局异常钩子、重试框架、依赖补丁或配置迁移。

## 本次验证

| 验收项 | 命令或方法 | 结果 |
| --- | --- | --- |
| HTTP 错误及 Hook 回归 | `rtk proxy pnpm exec vitest run tests/unit/lib/dev-request-handler.test.ts tests/unit/lib/codex-hook-session.test.ts tests/unit/lib/codex-environment-api.test.ts tests/unit/lib/server-agent-startup.test.ts tests/unit/lib/codex-launcher-lifecycle.test.ts` | 5 个文件、58 个测试通过 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 改动文件 ESLint | `rtk proxy pnpm exec eslint next.config.ts server.ts src/lib/dev-request-handler.ts src/pages/api/status/hook.ts tests/unit/lib/dev-request-handler.test.ts tests/unit/lib/codex-hook-session.test.ts` | 通过 |
| 实际配置与开发 HTTP | `node --import tsx /tmp/purplemux-http-abort-verify.cjs` | 根目录正确、缓存开关仍关闭；完整 POST 主动断开后无未捕获异常；Claude/Codex Hook 各返回空体 204，无令牌返回 403；无根目录及 API 返回值警告 |
| 生产构建 | `rtk proxy pnpm build` | 通过：Next.js 类型检查、Turbopack 编译、24 个静态页面、standalone 后处理及 tsup 服务打包均成功 |
| 文档与差异 | 本需求链接检查、`git diff --check` | 7 个链接/依赖路径存在，差异检查通过 |

HTTP 自动化使用真实本机套接字及已安装 Next.js 的 `getCloneableBody`，覆盖未读完请求体断开、克隆完成后断开、后续请求正常返回、同步异常、异步拒绝、活动连接上的下游 `ECONNRESET`、请求/响应流错误，以及已写出部分响应后失败。Hook 回归的 `end()` 模拟真实 Node 行为返回自身，断言处理器最终返回 `undefined`，防止原先空返回值 mock 掩盖问题。

沙箱内 Next.js 配置读取网卡失败；pnpm 原始诊断显示其无法创建临时包管理器目录（只读文件系统）。获准在沙箱外执行本机 HTTP、回归、ESLint 和构建检查，以上成功结果来自实际重跑。

## 限制

- 真实开发 HTTP 验证只启动 Next.js 及本次错误包装器，使用临时端口和进程内测试令牌；没有启动完整应用的 tmux 恢复、状态轮询和计划任务。未执行浏览器、HMR 或移动端实机验收。
- 未改变 Codex 启动超时；冷编译超出既有启动总期限仍可能导致启动器失败。本次修复的是连接关闭后的服务端未捕获异常，不承诺消除全部冷编译延迟。
- 未修改 Next.js 内部逻辑；框架自行处理并记录的其他请求解析错误不属于本包装器的全局过滤范围。
- 未提交、推送或发布。
