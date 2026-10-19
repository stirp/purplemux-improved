# 自动检测更新与一键升级重启：实施与验证

## 实施

本需求先制定[规格](./spec.md)，再实现双端升级。

- `src/lib/app-update-manager.ts`：共用检测、下载、重启状态机及并发锁；下载前和重启前检查会话，阻断后仅在用户再次点击时重试。
- `src/lib/app-update-guard.ts`：复用严格 tmux 快照、StatusManager 刷新与空闲策略。原状态枚举和任务判定不变，消费者约定同步至 `docs/STATUS.md`。
- `src/lib/app-update-server.ts`、`src/pages/api/app-update.ts`：启动后与六小时周期检测官方 npm 稳定版本，鉴权更新接口仅接受固定动作，安装准确版本到独立暂存目录；拒绝非法版本、包名/版本不符、缺少入口和语法错误。
- `bin/server-supervisor.cjs`、`bin/purplemux.js`、`server.ts`：监督生产服务，保持环境与端口；新进程报告就绪后原子保存运行目录，新版启动失败回退旧版。原安装目录、全局包及 tmux 会话不被删除。
- `electron/app-updater.ts`、`electron/native-update-preparation.ts`、主进程及 preload：复用已有更新源，关闭自动下载及退出时安装；macOS 下载后先通过最终空闲检查，再进入原生准备和安装重启阶段；IPC 校验顶层应用窗口与来源。更新退出路径正常走 Electron 退出事件，不提前强制 exit。该顺序经过下述审查修正。
- `use-app-update.ts`、`app-update-settings.tsx`、系统设置与页面外壳：状态轮询、持续更新提示、进度、阻断/错误重试、版本变化后刷新及重连超时刷新入口；普通浏览器管理服务端，Electron 管理桌面应用。旧 Electron bridge 不会误降级为服务端安装。
- 所有语言目录补齐相同键；简体中文有完整文案，其余语言当前使用英文回退文案（zh-TW 暂使用中文文案）。未扩展发布工作流。

设计上将状态机与平台安装细节分离（单一职责、依赖注入），复用既有任务判定和界面组件（DRY），仅保留当前需要的周期检测和显式安装，没有加入自动排队重启、清理策略或新配置开关（KISS/YAGNI）。

## 自动化验证

运行环境：Linux，Node `v22.14.0`；项目声明的运行最低版本是 Node 24，本机验证不能替代 Node 24 发布验收。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，未变更锁文件或依赖声明 |
| Vitest：`app-update-manager`、`app-update-guard`、`desktop-updater`、`app-update-api` | 22 项通过 |
| Vitest：`app-update-download` | 3 项通过 |
| 上述 5 个 Vitest 文件最终合并运行 | 25 项全部通过 |
| `node --test tests/cli/entrypoints.test.cjs tests/cli/server-supervisor.test.cjs` | 13 项通过，包含真实子进程启动握手和模拟故障回退 |
| `pnpm test:cli` 首轮 | 139 项中 138 通过；1 项旧启动器夹具缺少 package.json/就绪握手失败。补齐夹具后重跑上述 13 项通过，未将首轮记为全绿 |
| `pnpm exec tsc --noEmit` | 通过，完整应用类型检查 |
| `pnpm exec tsc --noEmit -p electron/tsconfig.json` | 通过，完整桌面类型检查 |
| 改动代码文件 `pnpm exec eslint --no-ignore …` | 通过；显式检查默认忽略的 Electron/bin 文件。CommonJS 入口仅豁免 require-imports 规则 |
| `pnpm build` | 首轮及最终界面调整后的完整 Next.js、post-build、server tsup 均通过 |
| `pnpm build:electron:main` | 通过，主进程、preload 和 server launcher 均成功构建 |

用例覆盖数值版本比较、非法版本、无更新/离线信息、并发检测与重复点击、两阶段忙碌/未知阻断、下载失败重试、macOS 原生准备失败与监听清理、HTTP 写请求约束、独立安装参数、安装产物校验、启动失败/进程错误回退、端口不符拒绝、路径与符号链接越界拒绝及后续启动目录选择。

## 浏览器验证

使用 agent-browser 独立会话 `upgrade-ws-lb7TjC`，在 `127.0.0.1:18244` 的临时页面加载真实更新组件、语言资源和生产 CSS，模拟 HTTP/桌面 bridge；未访问真实升级接口。

- 1280×800 与 390×844 均无横向溢出；修正首次移动截图中按钮挤压说明文本的问题。
- 浏览器入口点击一次仅发出一次 `install`，忙碌后显示中文阻断提示，说明不会延后自动重启。
- 桌面 bridge 仅调用 `desktop:install`；42% 下载进度显示正确，两个入口及检查按钮均禁用。
- 重启中显示等待重连；模拟计时器到期后出现明确失败提示和“刷新页面”。
- 不支持的一键安装显示运行方式提示并禁用安装；启动回退错误可见。
- 页面无浏览器脚本错误。
- 临时浏览器会话与组件测试服务器已关闭。

截图：[移动下载状态](./result/mobile-download.png)、[桌面重启状态](./result/desktop-restart.png)。这是组件集成验收，不是完整应用页面或原生 Electron 实机升级验收。

## 限制与未执行项

- 当前发布流水线仍暂停 Electron 安装包及更新元数据发布。代码接入完成，但实际桌面更新需要发布源存在匹配的签名安装包与元数据；缺失时显示错误。
- 未实际执行 npm 下载并切换真实服务，未在 macOS 上执行签名验证、系统安装及原生重启，也未做移动真机验收。
- 最终空闲检查与退出之间不冻结外部终端输入；退出保留 tmux 会话，不能声称已证明所有外部进程和未来版本数据迁移均无影响。
- 没有 Git 提交、推送、分支操作、发布、全局安装或升级重启用户当前实例。

## 审查修复：首次端口与 macOS 阻断副作用

用户要求修复审查中的两项 P2。本轮先修正规格中原生准备与最终空闲检查的顺序，再补回归测试和修复代码。

- `bin/server-supervisor.cjs` 不再从环境变量初始化实际端口。首个进程仍接收原请求端口，第一次成功就绪握手记录实际端口；后续升级/回退继续强校验。复用现有状态变量，未增加新的端口选择逻辑。
- `electron/app-updater.ts` 将原生准备从下载回调移至重启回调。共用状态机完成第二次空闲检查后，才进入有不可撤销副作用的 Squirrel 准备阶段；`blocked` 尝试仅保留下载文件，显式重试复用文件并重新检查空闲。没有修改或复制共用空闲策略。
- 规格明确：原生准备是已授权安装的提交阶段，不在其后用空闲检查宣称取消安装，也不承诺撤销已提交的原生安装或冻结外部输入。

修复前验证：监督器 8 项测试中两个新端口用例失败，均观察到首次正常就绪被发送 SIGTERM；桌面 6 项测试中三个顺序/阻断用例失败，确认最终检查之前已调用原生准备。

本轮验证：

| 命令或检查 | 本轮结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/app-update-manager.test.ts tests/unit/lib/app-update-guard.test.ts tests/unit/lib/desktop-updater.test.ts tests/unit/lib/app-update-api.test.ts tests/unit/lib/app-update-download.test.ts` | 27 项通过 |
| `node --test tests/cli/entrypoints.test.cjs tests/cli/server-supervisor.test.cjs` | 15 项通过 |
| `pnpm exec eslint --no-ignore bin/server-supervisor.cjs electron/app-updater.ts tests/cli/server-supervisor.test.cjs tests/unit/lib/desktop-updater.test.ts` | 通过 |
| `pnpm build:electron:main` | 通过 |
| `pnpm exec tsc --noEmit` 与 `pnpm exec tsc --noEmit -p electron/tsconfig.json` | 均通过，完整类型检查 |
| `git diff --check` 与 `node --check bin/server-supervisor.cjs` | 均通过 |

新增端口测试模拟 `PORT=0` 和请求端口回退后的就绪握手，检查升级与回退使用实际端口、拒绝再次换端口；没有占用用户实际服务端口。macOS 测试模拟 Squirrel 的退出时安装副作用，验证忙碌/未知阻断不调用原生更新器、普通退出无待安装更新，以及随后显式重试只下载一次。未执行真实 npm 升级或 macOS 实机安装。本轮没有界面或 Next.js 代码变更，未重新运行完整 Next.js 构建或浏览器验收，前文相关结果属于上一轮。

## PR #68 审查修复：即时忙碌状态与安装请求并发

对应 [review-5572942747](https://github.com/stirp/purplemux-improved/pull/68#pullrequestreview-5572942747) 的两项 P2；本轮先补充规格，再添加回归测试并修复。

- `src/lib/app-update-manager.ts` 在首次异步空闲检查前同步发布 `checking`。复用已有状态，使 HTTP/IPC 即时快照驱动按钮禁用及 2 秒轮询，无需新增状态或界面分支。
- 分别记录在途检测与安装 Promise；重复同类操作合并，安装进行中不插入检测。用户在后台检测期间点击安装，会等待该次检测结束并使用最新结果；失败或无新版时不沿用旧版本安装。空闲检查阻断即结束本次操作，后来空闲仍须用户重新点击，没有增加等待会话空闲的自动重启队列。
- `tests/unit/lib/app-update-manager.test.ts` 覆盖即时状态、检测后使用新版本且仅安装一次、离线/同版/旧版不安装及后续重试、阻断后的显式重试、安装期间检测合并。`tests/unit/lib/app-update-api.test.ts` 注入真实管理器，验证空闲检查未完成时 HTTP 202 已返回忙碌快照。

修复前运行两个测试文件，17 项通过、4 项失败：管理器和 HTTP 快照均错误返回 `available`，检测期间的安装请求未触发下载或空闲检查。修复后本轮验证如下：

| 命令或检查 | 本轮结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/lib/app-update-manager.test.ts tests/unit/lib/app-update-guard.test.ts tests/unit/lib/desktop-updater.test.ts tests/unit/lib/app-update-api.test.ts tests/unit/lib/app-update-download.test.ts` | 35 项全部通过 |
| `pnpm exec tsc --noEmit` | 通过，完整应用类型检查 |
| `pnpm exec tsc --noEmit -p electron/tsconfig.json` | 通过，完整桌面类型检查 |
| `pnpm exec eslint src/lib/app-update-manager.ts tests/unit/lib/app-update-manager.test.ts tests/unit/lib/app-update-api.test.ts` | 通过 |
| `pnpm build:server` | 通过 |
| `pnpm build:electron:main` | 通过 |
| `git diff --check` | 通过 |

本轮仅修改共用管理器、相关测试与本需求文档；沿用状态与界面消费逻辑（DRY），用两个在途操作记录实现明确的并发约定（KISS/YAGNI），平台下载和重启依赖保持分离（单一职责）。未重新执行 CLI 测试、完整 Next.js 构建或浏览器/桌面实机验收；未执行真实升级重启，历史相关结果不作为本轮验证。运行环境仍为 Linux / Node v22.14.0，不能替代项目要求的 Node 24 发布验收。
