# 实施与验证记录

## 实施

- `src/lib/layout-store.ts`：新建非浏览器标签复用 `resolveExistingDir`，传入可用目录并保存回退后的 cwd；回退时记录警告、跳过 command。保持未传 cwd 的 Tab 数据格式。
- `src/pages/api/layout/pane/[paneId]/tabs/index.ts`：比较请求与实际 cwd，回退时不绑定/恢复原生会话、不标记 agent 启动。
- `src/hooks/use-layout.ts`：目录回退后不进入等待命令/恢复启动的 `check` 状态，仍正常插入并激活新标签。
- 新增两个回归文件：`tests/unit/lib/layout-tab-creation-cwd.test.ts` 和 `tests/unit/lib/layout-tab-creation-client.test.ts`。
- KISS/DRY：复用已有目录解析和布局持久化，不新增路径扫描机制、接口字段或依赖；本次仅处理新建标签入口。工作区目录同步沿用已有逻辑，不直接修改真实配置或恢复 Git worktree。

## 根因证据

- 本机 `command -v tmux` 为 `/usr/bin/tmux`，版本为 `tmux 3.7c`。
- `ws-g1UrCn` 的目录为 `/home/home/.purplemux/worktrees/ws-_2Y-Uj/feat-custom-button-capability-enhancement (deleted)`；该路径和去除后缀后的原路径均不存在，父目录存在。
- 对应 `pane-ELHkEw` 布局存在且为空；不是 pane 丢失。
- 真实 Node `execFile('tmux', ['-V'], { cwd: 失效路径 })` 复现 `code: ENOENT, message: spawn tmux ENOENT`。
- 真实 `resolveExistingDir` 返回 `/home/home/.purplemux/worktrees/ws-_2Y-Uj`，以其为 cwd 的相同子进程返回 `tmux 3.7c`，退出 0。验证脚本使用仅进程内的静默 pino logger，避免写入真实日志。

## 验证

| 检查 | 实际结果 |
| --- | --- |
| 修复前：`node node_modules/vitest/vitest.mjs run tests/unit/lib/layout-tab-creation-cwd.test.ts` | 修正测试 provider 桩后，11 项中 5 项失败、6 项通过；缺失目录均返回 500 |
| 修复后：`node node_modules/vitest/vitest.mjs run tests/unit/lib/layout-tab-creation-cwd.test.ts tests/unit/lib/layout-empty-workspace.test.ts tests/unit/lib/layout-workspace-api.test.ts tests/unit/lib/layout-tab-rename.test.ts tests/unit/lib/tmux-paste.test.ts` | 5 文件、21 项通过 |
| `node node_modules/vitest/vitest.mjs run tests/unit/lib/layout-tab-creation-client.test.ts` | 3 项通过 |
| `node node_modules/typescript/bin/tsc --noEmit` | 完整检查通过 |
| `node node_modules/eslint/bin/eslint.js` + 三个源码及两个测试文件 | 通过；客户端桩修正后再次检查该测试文件 |
| `node node_modules/tsup/dist/cli-default.js --out-dir /tmp/purplemux-tab-cwd-build` | 服务端构建通过，输出隔离到临时目录 |
| `git diff --check` | 通过 |

验收映射：

1. ENOENT 由真实子进程复现；API 回归使用真实临时文件系统与真实布局存储，模拟 tmux 子进程，验证返回 200、cwd 和激活标签持久化。
2. 覆盖单层/嵌套失效路径、` (deleted)` 路径、合法同后缀目录、未指定 cwd 的 HOME 默认值。
3. 服务端覆盖回退后的 command/resume 保护、正常命令/恢复；客户端覆盖目录变化时不进入启动检查、正常目录仍进入检查。
4. 覆盖浏览器标签、缺失 pane、tmux 真正启动失败时布局文件保持原样。

运行限制：最初两次 `pnpm exec` 无输出等待，已中止，随后直接运行本地已安装工具入口。首次独立子进程验证虽输出正确结果，但默认 logger 因真实日志目录只读而退出失败；改为进程内静默 logger 后退出 0。没有新增依赖或更改系统环境。

未执行：完整 Next.js 生产构建、浏览器/手机实机验收、真实 API 创建标签、真实 tmux 会话创建及部署。本次子进程检查只执行 `tmux -V`，不影响已有会话。已删除 worktree 的代码没有恢复；修复后的新标签会进入现存父目录。

## Review P2 修复（2026-10-18）

原测试仅覆盖 hook，遗漏了桌面和移动调用方在返回后再次写入 `check`。本轮先补充本需求规格及验收条件，再修正调用方。

- `src/components/features/workspace/pane-container.tsx`、`src/components/features/mobile/mobile-terminal-page.tsx`：移除创建成功后重复的 `setSessionView(..., 'check')`，保留元信息初始化。`initTab` 合并既有状态，因此有效目录的启动等待仍由 hook 保留，回退目录保持默认 `session-list`。
- `tests/unit/lib/layout-tab-creation-callers.test.ts`：在 jsdom 中挂载两个真实父组件，通过子组件接收的真实创建回调运行真实布局及标签 store。模拟 API、终端及外围展示组件；覆盖两端 × Claude/Codex × command/resume/普通标签 × 回退/有效目录，共 24 项，断言请求、最终会话状态、标签激活及工作区元信息。
- `docs/STATUS.md`：明确新标签启动状态由 hook 判断及调用方的保留约束。
- KISS/DRY/SRP：仅删除两处重复状态写入，集中沿用现有启动判断；不新增判断函数、API 字段或依赖。

本轮实际运行：

| 检查 | 结果 |
| --- | --- |
| 修复前：`node node_modules/vitest/vitest.mjs run tests/unit/lib/layout-tab-creation-callers.test.ts` | 8 项失败、16 项通过；两端两代理的 command/resume 回退场景实际为 `check`，预期为 `session-list` |
| 修复后：以下 7 文件回归命令 | 48 项全部通过，包含新增调用方 24 项 |
| `node node_modules/typescript/bin/tsc --noEmit` | 完整检查通过 |
| `node node_modules/eslint/bin/eslint.js` + 本需求 5 个源码及 3 个测试文件 | 通过 |
| `git diff --check` | 通过 |

```bash
node node_modules/vitest/vitest.mjs run \
  tests/unit/lib/layout-tab-creation-callers.test.ts \
  tests/unit/lib/layout-tab-creation-client.test.ts \
  tests/unit/lib/layout-tab-creation-cwd.test.ts \
  tests/unit/lib/layout-empty-workspace.test.ts \
  tests/unit/lib/layout-workspace-api.test.ts \
  tests/unit/lib/layout-tab-rename.test.ts \
  tests/unit/lib/tmux-paste.test.ts
```

新增验收第 6 项由调用方测试覆盖；原验收第 2–4 项的自动化回归本轮重新通过。修复仅涉及调用方状态写入，本轮使用组件调用链测试验证，未执行完整 Next.js 构建、真实浏览器/手机验收、子进程复验或部署；上文真实子进程和服务端构建结果属于前次实施证据。

## 后续排查：新 worktree 中 fish 的 current_dir 错误（2026-10-18）

用户反馈新建 worktree 后，Terminal 报 `std::env::current_dir() failed` 和区域设置提示。本轮为排查，未修改应用源码或真实工作区配置，未重启/关闭用户会话。

现场证据：

- `git worktree list --porcelain` 显示 `feat/pause-unused-sessions` 对应 `/home/home/.purplemux/worktrees/ws-_2Y-Uj/feat-pause-unused-sessions`，该目录实际存在。
- 工作区 `ws-5VZGZq`（修复session管理）及标签 `tab-YJ7OdE` 保存的 cwd 却是 `/home/home/.purplemux/worktrees/ws-_2Y-Uj/feat-custom-button-capability-enhancement (deleted)`。
- 通过现有 `getAllPanesInfo`、`getSessionCwd`、`capturePaneContentWithHistory` 只读查询，确认新会话的 fish PID 352950 实际 cwd 为上述已删除路径，屏幕输出与用户反馈一致。
- Purplemux 专属 tmux 后台进程 PID 177195 的 `/proc/<pid>/cwd` 同样指向该已删除目录；应用服务进程的 cwd 为现存 `/home/home/workspace/purplemux`。

根因：当前安装版本为 tmux 3.7c。[该版本 spawn.c](https://github.com/tmux/tmux/blob/3.7c/spawn.c#L381) 在 `getcwd(path, sizeof path) != NULL` 条件内才执行切换至新 pane cwd、HOME 或 `/` 的逻辑。当后台进程原目录已删除，条件失败，新子进程继承失效 cwd；即使客户端 `execFile` 的 cwd 正确或传入 tmux `-c`，也无法触发这段切换。因此 fish 报 ENOENT，区域设置提示不是本次根因。

隔离复现：`node --import tsx /tmp/purplemux-tmux-cwd-repro.cjs` 复用本仓库 tmux 包装函数，仅在诊断进程内适配独立 socket、临时目录和测试命令。先在临时旧目录启动后台进程，再移除该空目录，随后从存在的新目录创建会话。以下三种情况均得到 `old-worktree (deleted)`，且屏幕复现 fish current_dir 错误：不继承 TMUX 环境变量、继承 TMUX 环境变量、额外显式指定 `-c new-worktree`。最终有效复现的独立会话均已关闭，未影响 `purple` socket 的用户会话。最初诊断适配器遗漏 execFile 的 promisify 返回结构，产生 null 结果；修正后以实际 PID、pane 输出和 cwd 交叉确认，null 不作为结论依据。

影响链路：tmux 后台失效 cwd → 新终端实际 cwd 错误 → `updateTab` 从 tmux 读取实际路径 → `syncWorkspaceDirectories` 将标签 cwd 同步回工作区。这解释了为何成功创建的新 worktree 随后显示旧 worktree 路径。上一轮请求 cwd 回退和客户端启动状态修复不能覆盖后台进程自身 cwd 失效的问题。

处理方向：当前终端可通过 `cd -- /home/home/.purplemux/worktrees/ws-_2Y-Uj/feat-pause-unused-sessions` 恢复至真实新目录；本轮未代为发送命令。后续代码修复需同时考虑后台进程从稳定目录启动、启动 shell 前可靠切换目标目录，以及现存失效后台进程的兼容；单独补 `-c` 不足以修复本次现场。

## tmux 后台失效 cwd 修复（2026-10-18）

用户确认修复后，已按新增验收第 7 项实现代码修复：

- `src/lib/tmux.ts#createSession`：所有创建入口统一先验证目标目录；tmux 客户端从 `/` 启动，使新后台进程不依赖 worktree。`-c` 明确目标目录，同时使用多参数执行绕过 tmux 默认 shell。
- Linux 使用 `/usr/bin/env -C <cwd> /bin/sh -c ...`，在任何 shell 初始化前切换目录，兼容已经处于删除目录的旧后台进程；其他平台使用 POSIX shell 的位置参数切换目录，再 `exec` 原有登录 shell 命令。
- 继续复用 `buildShellLaunchCommand` 的环境白名单、PATH 与登录 shell 规则。目录不拼接到 shell 代码中；目录不存在或为文件时在调用 tmux 前失败。未增加接口字段、依赖或后台重启逻辑。
- `tests/unit/lib/tmux-session-cwd.test.ts`：通过独立 socket 和临时 HOME 运行真实 tmux；包含普通目标目录、特殊字符目录、HOME 默认目录、缺失目录、文件目标、后台稳定 cwd、fish 输出共 7 项。默认跳过外部程序集成测试，使用下述环境变量显式启用。
- `tests/unit/lib/layout-tab-creation-cwd.test.ts`：调整断言，区分 tmux 客户端的稳定 cwd 和新 shell 的目标 cwd。
- `docs/TMUX.md`：同步创建路径、后台目录独立性及旧后台兼容行为。

本轮验证：

| 检查 | 实际结果 |
| --- | --- |
| 修复前真实 tmux 回归（初始 5 项） | 5 项失败；新终端实际 cwd 为 `deleted-worktree (deleted)`，fish 场景同样失败 |
| 最终相关回归（下述命令） | 9 文件、61 项全部通过，包含 7 项真实 tmux 检查 |
| `node node_modules/typescript/bin/tsc --noEmit` | 完整检查通过 |
| `node node_modules/eslint/bin/eslint.js src/lib/tmux.ts tests/unit/lib/tmux-session-cwd.test.ts tests/unit/lib/layout-tab-creation-cwd.test.ts` | 通过 |
| `node node_modules/tsup/dist/cli-default.js --out-dir /tmp/purplemux-tmux-cwd-build` | 服务端构建通过 |
| `git diff --check` | 通过 |

```bash
PMUX_TEST_TMUX=1 PMUX_TEST_FISH=/usr/bin/fish \
node node_modules/vitest/vitest.mjs run \
  tests/unit/lib/tmux-session-cwd.test.ts \
  tests/unit/lib/layout-tab-creation-callers.test.ts \
  tests/unit/lib/layout-tab-creation-client.test.ts \
  tests/unit/lib/layout-tab-creation-cwd.test.ts \
  tests/unit/lib/layout-empty-workspace.test.ts \
  tests/unit/lib/layout-workspace-api.test.ts \
  tests/unit/lib/layout-tab-rename.test.ts \
  tests/unit/lib/tmux-paste.test.ts \
  tests/unit/lib/worktree-api.test.ts
```

真实 tmux 验证读取 shell `/proc/<pid>/cwd` 确认目标目录，并读取其父进程 cwd 确认新后台在 `/`；fish 场景等待实际进程为 fish 后检查输出，无 `current_dir() failed` 或 getcwd 失败。所有测试会话经现有 `killSession` 清理，使用独立 socket，不操作 `purple` socket 的用户会话。

验证过程中修正了 beforeAll 内不支持 `expect.poll` 的测试写法。另经真实 POSIX shell 检查发现：单纯在 shell 内 cd 虽可恢复目录，仍会先产生 shell-init/chdir 警告，因此最终 Linux 路径在启动任何 shell 前使用 env -C；最终回归、类型检查、ESLint 和构建均在此调整后重新运行。

范围与限制：本轮完成代码及自动化/子进程验证，未执行完整 Next.js 构建、浏览器/手机实机验收或发布。非 Linux POSIX 分支未经 macOS 实机验证；旧后台已失效时可能出现引导 shell 自身的初始 getcwd 警告，但用户登录 shell 在目录切换后才启动。已有报错终端及其已保存的错误工作区目录不会因源码变更自动修复，需要在该终端 cd 到真实 worktree 后由正常元信息同步更新；本轮未发送该命令或直接重写用户配置。

## 路径兼容 Review 修复（2026-10-18）

针对末尾分号和相对目录的两项 P2，先补充规格路径兼容条款及验收第 8 项，再实现：

- `src/lib/tmux.ts#createSession`：用 `path.resolve` 在文件系统校验前按应用 cwd 得到绝对目录。随后为 tmux argv 生成独立的 `tmuxCwd`，在末尾分号前额外增加一个反斜杠，统一用于 `-c`、Linux `env -C` 和 POSIX 引导的位置参数。文件系统校验继续使用未转义的绝对路径。
- [tmux 3.7c 的参数解析](https://github.com/tmux/tmux/blob/3.7c/cmd-parse.y#L1094) 会将 argv 末尾分号作为命令分隔符；若其前有反斜杠则移除该反斜杠并保留分号。因此仅使用 execFile 独立参数不够，目录名原有的反斜杠也需要保留。
- `tests/unit/lib/tmux-session-cwd.test.ts`：新增 `project;`、`project;;`、反斜杠紧邻末尾分号、相对目录及相对目录末尾分号共 5 项真实回归。相对目录测试在隔离测试进程内切到临时应用目录，传入直接子目录名，并在 finally 恢复；避免含多个 `..` 的测试路径从 `/` 也能解析到同一目录而掩盖问题。
- `docs/TMUX.md` 同步路径基准和 tmux 转义规则。KISS/DRY：只计算一次绝对路径和一次 tmux 转义值，复用于各启动分支；不改接口、持久化格式或引入依赖。

实际验证：

| 检查 | 结果 |
| --- | --- |
| 转义修复前真实回归 | 分号相关 4 项失败：命令拆分报 `unknown command: /usr/bin/env`，或原反斜杠被吞掉后进入错误目录 |
| 保留转义、临时移除绝对化的对照：`PMUX_TEST_TMUX=1 node node_modules/vitest/vitest.mjs run tests/unit/lib/tmux-session-cwd.test.ts -t resolves` | 2 项相对目录均失败，shell 退出，实际 cwd 返回 null；验证后恢复最终代码 |
| 最终按上节完整回归命令运行 | 9 文件、66 项全部通过，含 12 项真实 tmux 检查 |
| `node node_modules/typescript/bin/tsc --noEmit` | 完整检查通过 |
| `node node_modules/eslint/bin/eslint.js src/lib/tmux.ts tests/unit/lib/tmux-session-cwd.test.ts` | 通过 |
| `node node_modules/tsup/dist/cli-default.js --out-dir /tmp/purplemux-tmux-path-review-build` | 服务端构建通过 |
| `git diff --check` | 通过 |

验收第 8 项由新测试覆盖；既有目录回退、启动状态保护及后台 cwd 失效相关检查本轮重新通过。所有真实 tmux 测试使用临时目录和隔离 socket；未操作用户现有终端、工作区配置或 Git 分支。未执行完整 Next.js 构建、浏览器/手机及 macOS 实机验收或部署。
