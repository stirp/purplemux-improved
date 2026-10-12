# CLI 单命令安装验证记录

日期：2026-10-10。依据：[规格](../features/fork-platform/spec.md)、[需求](../requirements/single-cli-install.md)。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| pnpm pack --out /tmp/purplemux-single-cli-*/package.tgz，读取 tarball 的 package/package.json | bin 仅为 purplemux-improved → ./bin/purplemux.js；脚本存在，帮助文件没有旧 tab 命令示例 |
| node --test tests/cli/features.test.cjs | 61 项通过，涵盖 CLI 分发、帮助、校验、配置文件回退等 |
| node node_modules/vitest/vitest.mjs run tests/unit/lib/codex-prompt.test.ts | 2 项通过 |
| pnpm tsc --noEmit；node node_modules/typescript/bin/tsc --noEmit | 完整 TypeScript 检查通过 |
| node node_modules/eslint/bin/eslint.js src/lib/claude-prompt.ts src/lib/providers/codex/prompt.ts --no-warn-ignored | 通过 |
| node node_modules/eslint/bin/eslint.js --no-ignore --rule '@typescript-eslint/no-require-imports: off' bin/cli.js bin/feature-commands.js | 通过；这两个 CommonJS 文件原本被项目 ESLint 忽略，禁用不适用的 require 规则后检查 |
| rg 检查提示、CLI 帮助及安装/CLI 文档的旧命令/别名；git diff --check | 未发现残留旧命令示例或空白错误 |

## 限制及失败记录

- 复用主工作树 node_modules 的本地链接，未安装或更新依赖。
- pnpm test:cli 自动尝试安装依赖，因非 TTY 拒绝清理 node_modules，未执行清理；改为直接执行同一 Node 测试入口并通过。
- 对原本被忽略的 CommonJS 文件强制 ESLint 时，默认 require 禁止规则报 6 项既有导入错误；使用上述针对性规则覆盖后通过，未修改模块格式。
- 未执行应用全量构建、全量测试或用户 Linux 全局安装。tarball 是安装入口验证制品，工作树没有生成完整服务端/Next.js 发布产物。
- 本次只验证新包声明的命令入口；已经存在的独立上游包、旧全局链接或手动别名需在实际安装环境确认归属，不自动删除。
