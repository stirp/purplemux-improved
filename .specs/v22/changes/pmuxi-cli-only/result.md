# pmuxi 实施与验证记录

日期：2026-10-16。依据：[需求规格](./spec.md)。本次先补齐独立增量规格，再修改实现。

## 实施

- `package.json` 注册 `pmuxi` → `bin/cli.js`，保留原 `purplemux-improved` 启动入口。
- `bin/cli.js` 无参数显示帮助，明确拒绝 `start`/`server`；其他未知命令继续报错。该入口只加载既有 CLI 功能模块，不引用服务启动器。
- `bin/cli.js`、`bin/feature-commands.js` 的命令帮助推荐 `pmuxi`。
- `src/lib/claude-prompt.ts` 与 `src/lib/providers/codex/prompt.ts` 的工作区命令改用 `pmuxi`，说明只连接已有服务。
- 中英文 README 与 CLI 参考说明两个命令的分工，操作示例改用 `pmuxi`，旧命令继续兼容。
- 现有 CLI 测试按包元数据对两个入口复用执行；新增入口边界测试在临时目录放置 server 替身，检测是否加载服务入口，不启动真实服务。

实现复用现有 HTTP 客户端与命令分发，未新增包装器、重复命令表或依赖，遵循 KISS、DRY 与 YAGNI；服务启动与 CLI 操作通过不同入口隔离职责。

## 验证

| 验收项 | 本次命令或方法 | 结果 |
| --- | --- | --- |
| 1：包入口 | `pnpm pack --out /tmp/pmuxi-cli-verification.tgz --json`，读取归档中的 package.json 和 bin 文件 | 通过：两个 bin 指向正确，CLI 功能模块存在，两个入口权限均为 0755 |
| 1–3：包内运行 | 解包到临时目录，通过名为 pmuxi 的符号链接执行归档入口 | 通过：无参数、features 返回 0，start 返回 1 |
| 2–4：CLI 与服务边界 | `pnpm test:cli` | 131 项全部通过：两个入口各 63 项原有回归，新增 5 项入口/边界测试 |
| 3：错误处理 | 入口测试覆盖缺少端口、缺少 token、连接失败、start/server、未知命令及启动参数 | 全部非零退出，未加载 server 替身 |
| 4：启动兼容 | 原入口无参数与 start 的隔离测试 | 均加载 server 替身；未拉起实际服务 |
| 5：提示兼容 | `pnpm exec vitest run tests/unit/lib/codex-prompt.test.ts` | 2 项通过 |
| 5：完整类型检查 | `pnpm tsc --noEmit` | 通过，无诊断输出 |
| 5：TS 与测试 Lint | `pnpm exec eslint src/lib/claude-prompt.ts src/lib/providers/codex/prompt.ts tests/cli/features.test.cjs tests/cli/entrypoints.test.cjs` | 通过，无问题 |
| 5：CLI Lint | `pnpm exec eslint --no-ignore --ignore-pattern '!bin/**' --rule '@typescript-eslint/no-require-imports: off' bin/cli.js bin/feature-commands.js` | 通过；显式检查仓库默认忽略的 CommonJS CLI 文件 |
| 5：语法与构建 | `node --check bin/cli.js`、`node --check bin/feature-commands.js`、`pnpm build:server` | 通过，生成 dist/server.js |
| 5：文档与差异 | 检查规格依赖路径、中英文 CLI 示例及 `git diff --check` | 通过 |

依赖通过 `pnpm install --frozen-lockfile --ignore-scripts` 准备，锁文件未变。已阅读本地 Next.js custom-server 指南；本次不改变 Next.js API 或服务构建逻辑。

## 限制

- 未执行全局安装、发布、真实服务启动或浏览器/实机验收；运行测试使用本地 mock HTTP 服务和隔离 server 替身。
- 本次验证 CLI 归档与 server bundle，未执行完整 Next.js 页面构建或生产安装包验收；打包检查不代表可发布的完整生产产物。
- 其他语言保留兼容的旧 CLI 示例；本次同步中英文文档。
