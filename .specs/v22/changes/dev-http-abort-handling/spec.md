---
page: dev-http-abort-handling
title: 开发服务请求中断与启动警告修复
status: DETAILED
created: 2026-10-21
depends_on:
  - ../dev-turbopack-cache-bypass/spec.md
  - ../codex-launch-lifecycle/spec.md
  - ../../../v20/features/agent-runtime/spec.md
  - ../../../v19/features/codex-hook-pipeline/spec.md
---

# 开发服务请求中断与启动警告修复

## 用户原始需求

修复 `env -u __PMUX_PRISTINE_ENV NODE_ENV=development pnpm dev` 启动后出现的问题：Next.js 将 `/home/home/package-lock.json` 所在目录推断为工作区根目录；编译 `/api/codex/launch-args` 期间反复出现 `Error: aborted / ECONNRESET / uncaughtException`；Codex Hook 返回 204 时提示 `API handler should not return a value, received object`。

## 范围与行为

- 显式将 Turbopack 根目录设置为配置文件所在项目目录，替代缓存规避规格中的“不修改根目录”边界；继续禁用开发持久化缓存，保留 HMR 和原启动命令。
- 自定义开发 HTTP 入口负责请求流、响应流及异步处理器错误。客户端断开导致的 `ECONNRESET` 只在对应连接已关闭时作为正常取消处理；其他错误仍记录并在响应允许时返回 500，已发送响应头时关闭连接。
- Next.js 16.2.6 的请求体克隆会替换原请求的流状态及事件监听。响应关闭时须保证请求仍有错误监听，避免 Node.js 在关闭连接时销毁克隆后的请求，产生未捕获异常。不得使用进程级异常吞错或修改依赖源码。
- Hook 各分支完成 HTTP 响应后只返回 `void`；状态码、响应体、认证、IP 过滤、根会话判定与事件处理保持现有契约。替代历史 Hook 示例直接返回响应对象的写法。
- 不改变 Codex 启动器的 15 秒总期限、5 秒单次请求期限、重试策略或用户配置，不修改生产代理、WebSocket、终端和持久化数据。

## 验收标准

1. Next.js 实际加载配置中的根目录是项目绝对路径，无多锁文件根目录推断警告，开发持久化缓存仍关闭。
2. 真实 HTTP 请求经过 Next.js 请求体克隆并在处理完成前断开，不触发未捕获异常；中断后新请求正常响应。
3. 自动化覆盖读取请求体时断开、克隆后断开、正常响应、处理器同步和异步错误、未发送及已发送响应头的错误处理；活动连接上的下游 `ECONNRESET` 不被误吞。
4. Claude/Codex Hook 的成功、忽略及拒绝分支均返回 `undefined`，保留状态码和业务行为。
5. 相关回归、完整 TypeScript、改动文件 ESLint、真实 Next.js 开发 HTTP 验证通过；记录未执行的浏览器及完整应用验收。

进度见 [task.md](./task.md)，实施和验证见 [result.md](./result.md)。
