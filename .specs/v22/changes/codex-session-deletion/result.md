# Codex 会话删除一致性：实施与验证

## 问题依据

2026-10-18 对源码和本机 session_meta 的只读检查确认：

- 原 `deleteOriginalSession` 只调用一次 `thread/delete`，没有收集独立保存的 review/其他 subagent 文件。41 个 review 的明确父 ID 已在隐藏记录中，且父 rollout 已不存在；这些子会话有 `parent_thread_id`，无需用 cwd 或时间猜测关系。
- `listCodexSessions` 原先把所有同 cwd 的 rollout 都当成可恢复会话，未识别 `source.subagent`；服务端虽然过滤隐藏父 ID，但无法过滤未被标记的 review 子 ID。
- `useCodexSessions` 使用 SWR 的 30 秒去重窗口及 `keepPreviousData`。历史删除及历史同步没有清除该缓存，所以项目列表仍可显示已失效的父会话。此项通过真实 hook、删除确认组件和 SWR 的隔离组件测试重现并验证。

## 实施

- `src/lib/codex-session-family.ts`：扫描 active/archived rollout 首行，按明确关系构造后代优先的删除序列；兼容旧 subagent fork 字段，排除普通 fork、无关项目会话和符号链接，循环关系去重；不限制创建时间或 cwd。
- `src/lib/delete-session.ts`：预检所有后代的本应用活动状态，逐个复核并调用既有原生删除接口；失败停止，部分完成也清空服务器元数据缓存。
- `src/lib/delete-codex-session.ts`：仅将当前目标 ID 的原生 `-32600 / no rollout found for thread id …` 识别为幂等完成，支持父文件已经删除的孤立后代清理重试；其他错误继续上报。
- `src/lib/codex-session-list.ts`：在解析首行时过滤 subagent，不再加载其用户消息和 token 统计。
- `src/lib/session-list-cache.ts`、`session-history-actions.tsx`、`use-agent-status.ts`：删除成功和历史全量同步（含重连）清除已挂载及未挂载的项目列表缓存，并重验当前列表。
- `use-codex-sessions.ts`：移除保留前一个查询结果的选项，防止缓存失效后仍展示旧会话或其他项目数据。

KISS/DRY：沿用原生删除协议、现有活动状态保护及 SWR 缓存机制；关系扫描单独承担后代发现职责。不修改 Codex 数据库结构，不引入后台任务或无依据的目录级删除。

## 验证

| 检查 | 本次实际结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/session-list-cache.test.ts tests/unit/lib/session-history-api.test.ts tests/unit/lib/session-workflow-menu.test.ts tests/unit/lib/workspace-sessions.test.ts tests/unit/lib/delete-session.test.ts tests/unit/lib/delete-codex-session.test.ts tests/unit/lib/codex-session-list.test.ts tests/unit/lib/codex-session-family.test.ts` | 50 项通过 |
| `PMUX_CODEX_INTEGRATION=1 pnpm exec vitest run tests/unit/lib/codex-session-deletion-native.test.ts tests/unit/lib/session-list-cache.test.ts` | 3 项通过，其中 1 项为真实 Codex CLI 集成、2 项为缓存组件复核 |
| `pnpm exec tsc --noEmit` | 完整 TypeScript 检查通过 |
| `pnpm exec eslint`，参数为本需求修改的 14 个 TypeScript/TSX 源码及测试文件 | 通过，无警告 |
| `pnpm build:server` | tsup 服务端构建通过 |
| `git diff --check` | 通过 |

验收映射：

1. `codex-session-family.test.ts` 覆盖历史、归档、多级、旧字段、普通 fork 保留、无关系 review 保留、循环去重和符号链接。
2. `delete-session.test.ts` 覆盖全量活动预检、扫描失败、部分删除失败和缓存失效；协议测试覆盖精确缺失 ID 的幂等重试及其他错误保留。
3. 列表测试覆盖 review/compact/thread_spawn 排除，原有排序、元数据缓存及并发加载回归通过。
4. `session-list-cache.test.ts` 使用真实删除确认组件、hook、SWR 和模拟 WebSocket：关闭列表后删除，30 秒内再开；重新查询尚未返回时无旧行；跨客户端/重连历史同步清除当前列表。
5. Codex CLI `0.162.1` 原生验证使用独立临时 home/子进程 CODEX_HOME 及合成 rollout，无登录信息、模型调用或真实用户数据。预先确认父会话、review 和无关 fork 可被原生发现；删除后父/review/归档后代的文件与 session_index 消失，`thread/read`、`thread/resume` 均失败，原生 `thread/list` 只保留无关 fork；重新创建孤立 review 后，以已不存在父 ID 重试也成功。

## 限制与真实数据边界

- 未执行完整 Next.js 生产构建、完整应用浏览器或移动实机验收；本次使用真实组件的 jsdom 验证、服务端构建及真实 Codex 原生集成验证。
- 修复验证阶段未删除真实会话；后续经用户明确确认执行的清理见下节。未提交 Git、发布或重启正在运行的应用。
- 已存在的孤立 review 不会自动从 Codex 原生存储消失，代码修复不等同于历史数据迁移。本机私有临时候选清单（41 个 review，31 个父 ID）未写入仓库。
- 没有明确父关系的旧 subagent 不推测删除；扫描读取失败时中止，原生删除部分失败时保留错误并支持重试。仍沿用当前项目固定 `~/.codex` 扫描路径，不在本需求扩展多 Codex home 配置。

## 用户确认后的历史数据清理

2026-10-18 用户明确回复“可以清理”，授权执行此前清单内的 41 个孤立 review 清理。

- 执行前重新读取全部项目 Tab、active/archived rollout 首行及隐藏记录，确认没有清单内 ID 关联 Tab，目标路径/身份/来源/父关系与清单一致，父 rollout 仍缺失。
- Codex 原生读取全部目标，确认均为未加载的 review，且父 ID 匹配。首次预检因原生接口使用 `subAgent`、文件使用 `subagent` 的命名差异中止，未发生删除；兼容这两个已核实的字段格式后再次预检通过。
- 只对清单内 41 个 ID 发送 `thread/delete`，全部收到成功确认；未扩展目标或直接修改数据库。
- 删除后逐项验证：41 个文件不存在；41 次原生 `thread/read` 返回不存在；session_index 与 state SQLite 的 threads 中残留为 0；原生 active/archived 列表分页查询命中为 0。
- 本机执行报告：`/tmp/purplemux-orphan-review-cleanup-result.json`。私有 ID、项目路径和原始清单均保留在临时本地文件，不进入仓库。

## Review P2：同步清理级联成员的应用记录

2026-10-18：修复“子会话曾单独恢复后，原生文件已随父会话删除，但应用内历史和工作区索引继续保留”的评审问题。先补充本需求规格的逐成员清理约定和验收条件 6，再实施。

- `deleteOriginalSession` 新增可选异步成功回调：每个成员原生删除确认后等待应用记录清理，再执行下一个成员。失败成员不触发回调；后续原生失败不会撤销此前成功成员的清理。应用存储清理失败也上报错误并中止后续删除。
- 新增共享 `removeSessionRecords`：按 provider + ID 保存隐藏标记、清除 workflow 索引/标题/人工状态并保存删除身份，再删除全部历史轮次并广播历史同步。复用原有存储锁及同步广播，避免在两条入口重复实现。
- 历史 DELETE API 与工作区会话清理均接入回调；仅隐藏、无原生 ID 的历史删除继续沿用所选身份语义。工作区已有原生删除进度的重试路径也使用共享清理。
- 新增 `codex-session-records-deletion.test.ts`，使用真实删除编排、API handler、隐藏/历史/workflow 存储逻辑和状态聚合函数，仅隔离文件系统、原生删除与外部广播。覆盖子会话多轮历史、标题、人工状态，父/兄弟失败，同 ID 不同 provider 保留，迟到历史与 inactive Tab 回补，以及仅隐藏父会话。
- 补充删除回调时序、应用存储异常中止和工作区删除跨项目后代清理回归；测试原生成功后立即广播子会话清理结果，即使接口最终返回失败。

本轮实际验证：

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/codex-session-records-deletion.test.ts tests/unit/lib/delete-session.test.ts tests/unit/lib/session-history-api.test.ts tests/unit/lib/workspace-sessions.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/session-history-removal.test.ts tests/unit/lib/workspace-delete.test.ts tests/unit/lib/session-list-cache.test.ts` | 63 项通过 |
| `PMUX_CODEX_INTEGRATION=1 pnpm exec vitest run tests/unit/lib/codex-session-deletion-native.test.ts` | 1 项通过；独立临时数据 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/delete-session.ts src/lib/remove-session-records.ts src/lib/workspace-sessions.ts src/pages/api/session-history.ts tests/unit/lib/delete-session.test.ts tests/unit/lib/session-history-api.test.ts tests/unit/lib/workspace-sessions.test.ts tests/unit/lib/codex-session-records-deletion.test.ts` | 无错误、无警告 |
| `pnpm build:server` | 服务端构建通过 |
| `git diff --check` | 通过 |

本轮未新增真实用户数据清理，未执行完整 Next.js 生产构建、浏览器或实机验收，未提交、发布或重启应用。

## PR #63：原生文件消失后的应用清理重试

2026-10-18，处理 [PR #63 的 P2 意见](https://github.com/stirp/purplemux-improved/pull/63#discussion_r4306581366)，审查基线 `561b49da852473cb187d33296be32d6d42476db8`。该意见成立：上一轮回调清理失败后，下一次仅扫描 rollout，丢失已经完成原生删除的子 ID。

实施：

- 新增 `src/lib/codex-deletion-progress.ts`，以原父 ID 为键保存 `{version: 1, pending: [...]}`。在任何原生删除前原子写入计划，每个成员的原生删除和应用清理均成功后才保存剩余成员；最后移除计划文件。
- `deleteOriginalSession` 将磁盘计划与重新扫描的成员合并，新发现后代先于计划中的祖先执行，缺失 rollout 的未完成成员继续通过已有幂等原生删除分支补做应用清理。
- 使用 `globalThis` 上的父 ID 锁串行执行同父请求，避免重复模块或并发重试覆盖待处理记录。无文件视为首次请求；损坏、重复 ID、非法 ID 或父身份不符的计划中止删除。
- 初始计划保存失败时不执行原生删除；推进写入失败仍保留原计划，重试幂等处理该成员。计划不依赖工作区存在，不新增后台恢复或真实数据清理。
- [数据目录指南](../../../../docs/DATA-DIR.md) 同步记录新增文件、锁和重试语义。

本轮实际验证：

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/codex-deletion-progress.test.ts tests/unit/lib/codex-session-records-deletion.test.ts tests/unit/lib/delete-session.test.ts tests/unit/lib/session-history-api.test.ts tests/unit/lib/workspace-sessions.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/session-history-removal.test.ts tests/unit/lib/workspace-delete.test.ts tests/unit/lib/session-list-cache.test.ts` | 76 项通过 |
| `PMUX_CODEX_INTEGRATION=1 pnpm exec vitest run tests/unit/lib/codex-session-deletion-native.test.ts` | 1 项通过 |
| `pnpm exec tsc --noEmit` | 完整类型检查通过 |
| `pnpm exec eslint src/lib/codex-deletion-progress.ts src/lib/delete-session.ts tests/unit/lib/codex-deletion-progress.test.ts tests/unit/lib/codex-session-records-deletion.test.ts tests/unit/lib/delete-session.test.ts tests/unit/lib/codex-session-deletion-native.test.ts` | 无错误、无警告 |
| `pnpm build:server` | 服务端构建通过 |
| `git diff --check` | 通过 |

验收条件 7 对应证据：

- API/存储集成分别注入 hidden-sessions、workspaces、session-history 写入失败；原生删除 mock 同步从扫描集合移除子 ID。重载模块后重试原父 ID，所有应用记录清除，成功广播、状态汇总和无关身份保留均通过。
- 实际临时文件验证权限、模块重载读取、损坏计划拒绝；不同模块实例的同父请求保持串行，失败释放锁，不阻塞无关父 ID。
- 真实 Codex CLI 集成在删除 review 文件后故意使应用回调失败，确认父文件仍存在，重载删除模块再重试；回调顺序为归档后代、review（失败）、review（重试）、父会话。验证进度文件移除、原生文件/索引/列表清理及无关 fork 保留。

限制：使用模块重载验证持久状态恢复，未重启实际用户服务；未执行完整 Next.js 生产构建、浏览器或移动实机验收。没有新增真实会话清理、提交、推送或 PR 评论。
