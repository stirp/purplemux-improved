# 0.5.2 性能优化验证记录

- 日期：2026-10-10
- 需求：[性能优化版本](../requirements/performance-optimization.md)
- 规格：[fork-platform](../features/fork-platform/spec.md)

## 版本准备阶段

用户确认 0.5.1 已打包安装。本次先记录版本目标与约束，再执行
`npm version patch --no-git-tag-version`，命令成功输出 `v0.5.2`。
同步 PRD、任务表及平台规格；不创建独立版本号功能模块。

### 版本元数据验证

- 检查 package.json：版本为 0.5.2，与 Git 基线相比仅 version 字段变化。
- `git diff --check`：通过。
- 版本准备阶段只变更元数据与规格，未修改运行代码；该阶段未执行 TypeScript、ESLint、测试、构建或浏览器验收。
- 未执行 Git 提交、标签、推送、安装或发布。

### 版本准备时的未完成项

性能基线、瓶颈分析、优化实现、前后测量和安装验收均待执行。
版本号更新不代表性能已改善，也不代表新版本已发布。

## 工作范围初审（2026-10-10）

只读检查会话列表及元数据缓存、时间线分页与渲染、终端流控、状态扫描、前端轮询、同步与 Worktree 空间统计。
结果已记录到需求的 PERF-01 至 PERF-07 清单；已有缓存、按轮加载、终端背压和状态降频作为后续验证基线。
本次只完成源码风险分析和工作安排，未运行基准测试，未确认性能瓶颈，也未实施运行代码优化。
文档变更通过 `git diff --check`；TypeScript、ESLint、构建与浏览器验证未执行。

## 第一轮会话元数据优化（2026-10-10）

### 自动化结果

| 检查 | 命令与结果 |
| --- | --- |
| 全量测试 | `pnpm test`：120 个文件，858 项通过，1 项可选微基准跳过；CLI 61 项通过 |
| 最终相关回归 | `pnpm exec vitest run tests/unit/lib/session-meta-cache.test.ts tests/unit/lib/codex-session-list.test.ts tests/unit/lib/session-list-performance.test.ts`：16 项通过，1 项可选微基准跳过 |
| 可选微基准及真实文件测试 | `PERF_SESSION_LIST=1 pnpm exec vitest run tests/unit/lib/session-list-performance.test.ts`：3 项通过 |
| 完整 TypeScript | `pnpm exec tsc --noEmit`：通过 |
| 改动文件 ESLint | `pnpm exec eslint src/lib/session-meta-cache.ts src/lib/bounded-concurrency.ts src/lib/session-list.ts src/lib/codex-session-list.ts tests/unit/lib/session-meta-cache.test.ts tests/unit/lib/codex-session-list.test.ts tests/unit/lib/session-list-performance.test.ts`：通过 |
| 生产构建 | `pnpm build`：Next.js 类型检查、编译、页面生成、post-build 和服务端 tsup 全部通过 |
| 差异检查 | `git diff --check`：通过 |

首次 TypeScript/构建发现泛型缓存值的 null 收窄错误，已修正显式非 null 判断，随后完整类型检查、生产构建和相关回归通过。

### PERF-CACHE 验收映射

- PERF-CACHE-01/02：缓存测试覆盖超过 30 秒、各文件状态字段变化、路径隔离、并发合并、删除/失败重试、null 结果、读期间变化、LRU 淘汰与清理期间最终 stat 竞态。
- PERF-CACHE-01/02：Claude 真实文件测试覆盖 10 个并发读取、追加后恢复原 mtime、改写、删除和同 ID 不同目录。
- PERF-CACHE-03：Codex 35 个匹配会话、1 个其他目录会话和1个无效文件，加载峰值不超过 10；核对字段、排序、目录/文件计数、缓存重用、追加、删除、主动清理以及统计临时失败恢复。
- 原有 history API 隐藏过滤与分页、按轮时间线测试包含于本次全量通过结果。
- PERF-CACHE-04：下表记录优化前后独立运行的微基准。

### 微基准结果

环境为本工作树所在 Linux、Node.js v22.14.0；50 个合成 Claude 会话，共 53,503,600 字节，读取并发 10。
模拟时钟推进 31 秒，真实 JSONL 读取和解析，隔离 tmux/provider 路径转换/日志。

| 场景 | 优化前耗时 | 优化后耗时 | 完整文件扫描（前 → 后） |
| --- | --- | --- | --- |
| 冷读取 | 310 ms | 306 ms | 50 → 50 |
| 紧接着热读取 | 3 ms | 2 ms | 0 → 0 |
| 模拟经过 31 秒后刷新 | 256 ms | 2 ms | 50 → 0 |

耗时为单次微基准样本，不是 p50/p95，也不代表 HTTP、浏览器或安装包端到端速度。
确定性的收益是未变化的缓存文件不再因 30 秒超时被完整重读；文件变化后仍完整解析。
Codex 消息扫描已同样优化，其统计尾部读取仍沿用原有缓存策略。

### 限制与后续工作

- 未进行浏览器/移动端/macOS 实机或安装包验收，也未重新打包安装。
- PERF-01 的完整 CPU、内存、启动及交互基线，PERF-03 至 PERF-07，以及元数据增量读取和分页优化仍待推进。
- 全量测试后仅增加显式 null 类型收窄，该处不改变运行行为；修改后相关回归、完整类型检查及生产构建已重跑通过。
- 未执行 Git 提交、标签、推送或发布。
