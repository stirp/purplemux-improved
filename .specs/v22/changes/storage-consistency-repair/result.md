# 存储一致性修复结果

## 实施

2026-10-18，检查本机 `/home/home/.purplemux`，依据本需求 [spec.md](./spec.md) 与其中引用的历史基线实施。

初次检查：90 个 JSON 均可解析；11 个索引工作区、63 个工作区目录，其中 52 个未索引目录仅含 `layout.json`。布局焦点引用有效。44 条 worktree 元数据中 23 条路径不存在，其中一条对应用户后来要求恢复的工作区。会话索引存在隐藏标记未同步及原生文件缺失的记录；历史 Tab 绑定属于迁移/防继承记录，未将它们直接认定为损坏并删除。

代码修复：

- `src/pages/api/layout/index.ts`：不存在的工作区 GET 返回 404，不调用会创建布局及终端的 `getLayout`。
- `src/lib/workspace-store.ts`：工作区删除使用独立的跨模块共享串行锁，原生会话清理不持有工作区写锁，避免 `removeSessionWorkflow` 等待同一写锁。最终提交重读最新文件，保留期间的并发更新和删除标记，重新确认终端已退出；删除当前工作区时修正激活引用。
- `tests/unit/lib/layout-workspace-api.test.ts`、`tests/unit/lib/workspace-delete.test.ts`：覆盖过期工作区读取、锁重入自等待、更新丢失和清理期间终端重新出现。

复用原有写锁队列、文件原子写入、会话清理和提示文件生成工具，未引入新依赖或后台清理。代码只修正已确认的入口及锁顺序；实际历史清理独立执行，避免启动时自动修改用户资料。

## 实际数据处理

实际写入前重新生成快照并核对 SHA-256。备份目录：

`/home/home/.purplemux/backups/storage-repair-20261018-203413/`

该目录含受影响的 `workspaces.json`、`worktree-metadata.json` 原件、52 个归档布局目录、`plan.json` 和 `result.json`。一轮写入暂停服务进程约 0.028 秒，未终止 tmux；异常时脚本回滚并恢复进程，另有 20 秒恢复看门狗。

- 52 个无运行终端的孤立布局目录移入备份，不永久销毁。
- 清除 22 条目录已不存在且不再被工作区引用的 worktree 元数据，原值完整备份。
- 使用既有本地分支 `feat/custom-session-categories` 恢复目录 `/home/home/.purplemux/worktrees/ws-_2Y-Uj/feat-custom-session-categories`，HEAD 为 `6e8847c08a470d5674fb0b20a41ae6634bb0226e`，工作树干净。
- 恢复 `ws-5p9Bph` 工作区入口、原父级及分组、原空布局，并通过现有生成函数恢复 Claude/Codex 提示文件。
- 实际执行时会话索引已由应用更新，修复计划没有删除任何会话索引；`sessionWorkflow` 与执行前备份深比较一致，原生会话文件和删除计划均未由此脚本修改。

检查与执行之间，运行中的应用数据发生变化，不能将最初数量当作实际清理数量。服务为 `pnpm dev` / `tsx watch server.ts`，代码修改触发了开发服务自动重载。应用日志在 `1792320540491` 记录已删除 `ws-5p9Bph`；后续复核显示另有多个工作区已删除。实际修复以写入前的新快照为准，没有恢复其他工作区或覆盖用户的新状态。

## 验证

| 检查 | 本次结果 |
| --- | --- |
| 相关 Vitest：layout-workspace-api、workspace-delete、workspace-delete-api、session-workflow-storage、session-tags、layout-empty-workspace | 6 文件、47 测试通过 |
| `pnpm exec tsc --noEmit` | 通过，完整项目检查 |
| ESLint：两个改动源码与两个测试文件 | 通过 |
| `git diff --check` | 通过 |
| 实盘工作区、分组、父级、目录、布局焦点、隐藏会话引用 | 通过：7 工作区对应 7 目录，无孤立目录 |
| 实盘 JSON 解析 | 28 个当前数据 JSON 通过；排除备份、代码 worktree、日志及上传目录 |
| 实盘 worktree 元数据 | 所有保留路径存在 |
| 会话数据保持 | 实际修复前后 `sessionWorkflow` 深比较一致 |
| `GET /api/health`、`GET /api/workspace` | 实际开发服务返回 200 |
| `GET /api/layout?workspace=ws-5p9Bph` | 实际开发服务返回 200 |
| `GET /api/layout?workspace=ws-storage-audit-missing` | 返回 404，磁盘未生成对应工作区目录 |

首次沙箱内 Vitest/ESLint 输出无法读取，不计为通过；解除沙箱后使用 `rtk proxy pnpm exec ...` 获得上述实际通过结果。运行脚本位于 `/tmp/purplemux-storage-{runtime.ts,repair.py,verify.cjs}`，提示恢复脚本为 `/tmp/purplemux-restore-prompts.ts`，执行版本另存备份目录以便核对。

提示恢复脚本首次直接导入提示模块遇到既有循环依赖初始化错误；改为先加载布局模块后重试成功，两个提示文件均已生成并验证包含原工作区 ID。临时脚本调整未修改应用提示实现。

## 未完成与限制

- 用户确认保留历史之前，原删除流程已经完成目标工作区的删除。父会话 `01a147e8-2761-7c40-abe4-ac57e5f2f887` 及两个子会话 `01a149ce-b347-71a1-82aa-4446c213c84d`、`01a14de9-1f88-7eb0-befd-270eff2992a9` 的原生文件均不存在；已恢复代码及入口，但没有可据以恢复对话的原生文件。未伪造历史或解除其删除标记。
- 恢复代码仅包含原分支已提交内容，无法证明已删除目录中的未提交修改得到恢复。
- 其他身份的待处理删除计划保留，未擅自继续原生删除。
- 未执行生产构建、发布或浏览器 UI 验收；本次涉及服务端存储和 API，已运行实际开发服务 HTTP 验证。
- 没有执行 Git 提交或推送；唯一 Git 写入是用户明确选择的既有分支 worktree 恢复。
