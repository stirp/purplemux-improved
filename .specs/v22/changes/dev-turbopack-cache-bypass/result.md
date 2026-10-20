# 实施与验证

日期：2026-10-20。规格：[spec.md](./spec.md)。

## 实施

- `next.config.ts` 的现有 `experimental` 对象新增 `turbopackFileSystemCacheForDev: false`，绕过开发持久化缓存恢复引发的 PostCSS 进程增长。
- 采用单项配置规避，不引入缓存清理器或新的启动分支，遵循 KISS/YAGNI；复用 Next.js 官方配置，无重复实现。
- 依赖、生产缓存配置、PostCSS 颜色兼容逻辑、用户数据和启动命令不变；原缓存未删除。代价是跨重启重新编译。

## 本次验证

| 验收项 | 命令或方法 | 结果 |
| --- | --- | --- |
| 实际配置 | Next.js `loadConfig(PHASE_DEVELOPMENT_SERVER, root)` | `cacheEnabled: false`，`distDir: .next/dev` |
| 受限编译及空闲观测 | `python3 /tmp/purplemux-cpu-monitor.py node --import tsx /tmp/purplemux-cpu-config-verify.cjs` | 55.26 秒观察正常结束，登录页 HTTP 200；15.3 秒完成请求，编译后稳定为 1 主进程 + 2 PostCSS 子进程 |
| 完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 改动配置 ESLint | `pnpm exec eslint next.config.ts` | 通过 |
| 差异与文档 | `git diff --check`；本需求链接及依赖路径检查 | 通过 |

观测使用修改后的真实仓库配置，无临时覆盖缓存开关，保留原输出目录和 tsx 加载器。诊断 HTTP 服务只监听 `127.0.0.1:18022`，不执行完整应用的会话恢复与任务调度。进程组超过 18 个进程或 2.5 GB RSS 会被保护脚本停止，本次未触发阈值；期间另捕获一个短暂子进程，不能将累计捕获数等同于稳定进程数。

进程组 CPU 使用单核百分比计量：30.9 秒为 6.0%，随后为 0.0%、3.9%、1.5%、0.0%；末尾 RSS 约 1061 MiB。类型检查与 ESLint 同期运行，因此编译时间不用于与上一轮比较性能收益。诊断服务已自动停止。

原始日志：`/tmp/purplemux-cpu-config-verify.txt`。这些是当前修改后的运行结果，未使用上一轮临时配置实验冒充本次验证。

## 限制

- 未运行生产构建、完整业务回归、浏览器热更新或移动端实机验收；本次针对开发缓存配置，以真实配置加载和 HTTP 编译验证影响路径。
- 编译阶段仍有正常 CPU 峰值；本次验证的是子进程数量稳定以及编译后负载回落。
- 尚未确定 Next.js 缓存内部缺陷；本变更是规避措施。
- 未执行 Git 提交、推送或发布。
