# 实施与验证记录

## 诊断

- `src/lib/git-commit.ts` 的 `withIndexCopy` 只复制索引字节，副本修改时间晚于原索引。Git 使用索引修改时间判断 stat 缓存是否可能与文件内容变化竞争；推进这个边界会漏掉同大小、相同 stat 的改动。
- 在真实临时仓库中将文件与原索引 mtime 固定到同一时间，并仅在测试仓库设置 `core.checkStat=minimal`、`core.trustctime=false`，模拟低精度 stat。将 `base\n` 改为同大小的 `child` 并保持文件 mtime 后，原索引 `git diff` 能看到改动，普通副本 `git add` 后看不到改动，保留时间的副本能看到改动。
- 不修改实际工作仓库的 Git 配置；回归只使用测试创建的临时仓库。本轮不进行实际工作分支提交或推送。

## 实施

- `src/lib/git-commit.ts`：在复制前读取原索引 stat，复制后用原 atime/mtime 设置私有索引。mtime 的 Date 毫秒精度截断会保守地提前边界，不会延后；Git 必要时重新比较内容。继续共用 `withIndexCopy`，不引入第二套预览或提交逻辑（KISS/DRY）。缺失索引的初始提交及 finally 清理保持原约定。
- `tests/unit/lib/git-commit.test.ts`：增加主仓库、linked worktree 两种真实 Git 场景，验证同大小修改出现在生成证据中、原索引字节及 mtime 不变、再次同大小修改后拒绝旧快照、重新生成后提交最新正文。无需依赖真实时钟竞争或增加 sleep。

## 验证

- 修复前 `pnpm exec vitest run tests/unit/lib/git-commit.test.ts -t "detects same-size changes"`：新增两项均失败，错误为 `noChanges`，其余 22 项按筛选跳过。
- 修复后 `pnpm exec vitest run tests/unit/lib/git-commit.test.ts tests/unit/lib/git-commit-api.test.ts tests/unit/lib/git-commit-delivery.test.ts`：42 项通过。
- 完整类型检查 `pnpm exec tsc --noEmit`：通过。
- `pnpm lint`：全仓 ESLint 通过。
- 静态检查结束后执行标准 `pnpm test`，退出码 0：Vitest 204 个文件通过、2 个跳过；1939 项通过、14 项跳过，0 失败（180.59 秒）。随后自动执行 CLI 测试，153 项通过，0 失败、跳过或取消（46.00 秒）。原失败用例及本轮新增回归均通过，无修改并发或超时配置、无自动重试。
- Vitest 输出包含 jsdom 不支持完整页面导航的既有 stderr 提示；没有被报告为失败测试或未处理异常，命令正常进入并通过 CLI 阶段。
- `git diff --check` 及本需求 Markdown 链接存在性检查：通过。
- 本次运行环境：Node v22.14.0、pnpm 12.11.2、Git 2.55.0。远端 CI 要求 Node 24，本轮仅证明本地完整检查通过，尚未推送触发远端验证。
- 本轮只修改 Git 索引复制逻辑，真实 Git 单元/API/交付及全量回归已覆盖；没有界面或打包配置变化，未另行运行构建或浏览器验收。
- 未提交、推送、发布或重启应用；此前 PR #79 取消竞态及测试隔离修复继续保留。
