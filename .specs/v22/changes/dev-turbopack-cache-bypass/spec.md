---
page: dev-turbopack-cache-bypass
title: 禁用 Turbopack 开发持久化缓存
status: DETAILED
created: 2026-10-20
updated: 2026-10-20
depends_on:
  - ../../../v20/requirements/performance-optimization.md
  - ../ios-transparent-colors/spec.md
---

# 禁用 Turbopack 开发持久化缓存

## 用户原始需求

用户使用 `env -u __PMUX_PRISTINE_ENV NODE_ENV=development pnpm dev` 启动时 CPU 达到 100%，要求查清原因；受限对照定位到现有 Turbopack 开发持久化缓存恢复后 PostCSS 子进程快速增长，关闭缓存后恢复正常。用户随后要求：“改一下配置吧”。

## 范围与行为

- 在 `next.config.ts` 的 `experimental` 中显式设置 `turbopackFileSystemCacheForDev: false`，绕过现有开发磁盘缓存的恢复与持久化。
- 本增量只新增开发编译缓存策略；沿用性能基线的测量与证据要求，以及 iOS 颜色兼容规格中的开发和生产 PostCSS 转换。
- 保留 `tsx watch`、Turbopack、开发热更新及原启动命令；不修改生产缓存设置、依赖版本、根目录、业务配置或用户数据，不删除已有缓存。
- 跨开发服务重启需要重新编译；本次是经对照验证的规避措施，不宣称已修复 Next.js 内部缓存缺陷。

## 验收标准

1. Next.js 实际读取的开发配置中 `turbopackFileSystemCacheForDev` 为 `false`。
2. 使用仓库配置及原开发输出目录进行受限 HTTP 编译验证：登录页成功返回，PostCSS 进程数量稳定，编译后 CPU 回落；保留限制与原始证据。
3. 完整 TypeScript、改动配置的 ESLint、差异格式检查通过；明确记录未执行的浏览器热更新和完整应用验收。

实施进度见 [task.md](./task.md)，实施与验证见 [result.md](./result.md)。
