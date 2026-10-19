# 验证记录

验证日期：2026-10-19。规格已写、代码已实现；前三节为初次实施的实际执行结果，Review 修复本轮结果单独记录在末节。

## 自动化验证

```bash
pnpm exec vitest run --maxWorkers=1 --testTimeout=20000 \
  tests/unit/lib/scheduled-tasks.test.ts \
  tests/unit/lib/scheduled-task-service.test.ts \
  tests/unit/lib/scheduled-task-runner.test.ts \
  tests/unit/lib/scheduled-tasks-ui.test.ts \
  tests/unit/api/scheduled-tasks.test.ts \
  tests/unit/lib/terminal-commands-storage.test.ts \
  tests/unit/lib/workspace-menu-order.test.ts \
  tests/unit/lib/workspace-item-render.test.ts
```

结果：8 个文件、74 项通过。构建同时运行时主机负载较高，首次 UI 用例触发默认 5 秒超时；最终使用单 worker 和 20 秒超时完成，没有放宽断言。

| 验收 | 本次证据 | 结果 |
| --- | --- | --- |
| 三种类型、旧配置、持久化、并发更新 | service 测试及既有终端配置存储回归；UI 创建三种类型 | 通过 |
| 单次/每日/每周及时区 | calendar 测试覆盖上海、纽约夏令时缺失/重复、加德满都偏移及时刻边界 | 通过 |
| 防重入、认领失败不执行、4 任务上限 | service/scheduler 测试覆盖并发手动启动、自动重叠、记录保留、关闭、重启和错过时间 | 通过 |
| Shell 与进程清理 | 实际运行 `/bin/sh`，覆盖正常/非零退出、stderr、输出截断、超时、AbortSignal 和监护进程 IPC 断开 | 通过 |
| AI 提示词与环境 | 本地 Claude/Codex CLI 替身验证参数、stdin 特殊字符、独立会话、配置环境和 cwd | 通过；未调用真实模型 |
| API 校验及错误 | API 测试覆盖 CRUD、启停、立即执行、非法/未知字段、错误状态及内部错误屏蔽 | 通过 |
| 保存失败、删除确认、日志文本、读取重试 | jsdom 真实组件交互测试 | 通过 |

其他检查：

- `pnpm exec tsc --noEmit`：完整类型检查通过。新测试的请求类型及 IPC pipe 类型声明已修正后重跑。
- `pnpm exec eslint`：对本次全部改动/新增 TS、TSX 文件（含测试和 server.ts）检查，无问题。
- `pnpm build`：Next.js 生产构建、静态页面生成、post-build、tsup 均通过；路由包含 `/api/scheduled-tasks`。后续仅补充了类型断言/测试类型声明，无运行逻辑改动。
- `git diff --check`：通过。
- 规格内相对链接、依赖路径及所有语言目录的新增文案键一致性：通过。

## 生产构建浏览器和运行验证

使用 agent-browser 独立会话 `scheduled-tasks-ws-h73krt` 访问本地 `127.0.0.1:18642` 生产构建。测试数据位于 `/tmp/purplemux-scheduled-verify`；通过进程内 os.homedir 替身和独立 TMUX_TMPDIR 隔离现有用户配置及会话，没有替换 HOME。

1. 登录后通过桌面工作区设置菜单进入「定时任务」，填写名称、命令、目录及每日计划，保存成功。
2. 点击「立即执行」，实际 Shell 输出 `scheduled-task-ok` 和指定目录，记录正常退出、退出码 0、开始/结束时间；跨 Next.js/API 与外层服务的调度单例共享正常。
3. 切换到 390×844 窄屏，通过移动端工作区操作菜单进入，填写 Codex 每周任务并保存为暂停状态。任务及弹窗均无横向溢出；长表单可滚动到保存按钮。
4. 新建未来 25 秒的单次 Shell 任务，真实 15 秒调度器自动触发，输出 `automatic-ok`；执行后启用状态为 false，nextRunAt 为 null，仅一条 scheduled 记录。
5. 关闭并重启独立生产测试服务，三条任务及记录保持一致；已完成单次任务未重放。
6. 无登录 Cookie/token 请求任务 API 返回 401。

最初自动化在未滚动到表单底部时点击保存，实际点击落在弹窗外导致关闭；滚动到可见保存按钮后成功，不是保存接口或草稿状态缺陷。

证据：[桌面执行记录](./desktop.png)、[移动端任务列表](./mobile.png)、[移动端 Codex 编辑](./mobile-editor.png)、[真实执行与重启对照](./runtime.json)。

## 限制

- Claude/Codex 的真实账户、模型响应及工具权限未做在线验收；已验证 CLI 调用协议和本地替身行为。运行仍依赖用户已安装并登录相应 CLI。
- 窄屏为 Chromium 视口模拟，未进行手机实机或其他浏览器内核验证。
- 本次没有提交 Git、发布或替换用户正在运行的实例。使用新入口需要运行本分支构建。

## Review 修复本轮验证（2026-10-19）

先新增回归测试，在修复前运行日历与 service 两个测试文件：15 项通过、10 项失败，覆盖跨夏令时缺失周、结果写入重试和孤立任务清理问题。修复后日历、service、真实工作区删除三个文件合计 35 项通过。

随后执行以下完整相关回归，12 个文件共 110 项通过：

```bash
pnpm exec vitest run --maxWorkers=1 --testTimeout=20000 \
  "tests/unit/lib/scheduled-tasks.test.ts" \
  "tests/unit/lib/scheduled-task-service.test.ts" \
  "tests/unit/lib/scheduled-task-runner.test.ts" \
  "tests/unit/lib/scheduled-tasks-ui.test.ts" \
  "tests/unit/api/scheduled-tasks.test.ts" \
  "tests/unit/lib/terminal-commands-storage.test.ts" \
  "tests/unit/lib/workspace-menu-order.test.ts" \
  "tests/unit/lib/workspace-item-render.test.ts" \
  "tests/unit/lib/workspace-delete.test.ts" \
  "tests/unit/lib/workspace-delete-api.test.ts" \
  "tests/unit/lib/workspace-reorder.test.ts" \
  "tests/unit/lib/workspace-group-order.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/lib/scheduled-tasks.ts" \
  "src/lib/scheduled-task-scheduler.ts" "src/lib/workspace-store.ts" \
  "tests/unit/lib/scheduled-tasks.test.ts" \
  "tests/unit/lib/scheduled-task-service.test.ts" "tests/unit/lib/workspace-delete.test.ts"
pnpm build:server
git diff --check
```

完整 TypeScript、上述改动文件 ESLint、服务端 tsup 构建及差异格式检查均通过；需求目录 Markdown 相对链接和 depends_on 路径检查通过。

| 修复验收 | 本轮证据 | 结果 |
| --- | --- | --- |
| 8：跳过缺失周，继续下一有效周 | 纽约周日 02:30 在 3 月 1 日执行后及缺失周前创建、重新启用、自动推进，下一次均为 2026-03-15T06:30:00Z | 通过 |
| 9：失败结果保存恢复 | 连续写入失败后由 15 秒定时器重试，原输出、退出码、原因、截断标识及结束时间保持；恢复编辑和删除；四条失败结果恢复后并发手动启动和 tick 不覆盖新执行、不重复执行；关闭前再次保存 | 通过 |
| 10：释放孤立任务额度 | 50 条历史孤立任务清理后并发创建成功，有效任务仍受 50 条限制；启动清理孤立 running；真实删除工作区两种会话删除模式均清理未运行任务，保留运行占用，其他工作区不变；删除失败保留任务；运行结果保存后清理并释放并发额度 | 通过 |

本轮仅修改日历、调度、存储及测试，未修改 UI 或 API 输入结构；重新执行了 UI/API 自动化回归和服务端构建，未重新执行完整 Next.js 构建、浏览器或实机验收。上文浏览器与完整构建记录属于初次实施，不作为本轮执行证据。未进行 Git 提交、发布或替换运行实例。
