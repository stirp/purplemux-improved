# 按代理环境配置：验证记录

日期：2026-09-29。关联[需求](../requirements/per-agent-environment.md)及[实施记录](./build-per-agent-environment.md)。

## 验收结果

| 项目 | 结果 |
| --- | --- |
| Claude/Codex 独立保存、清空、旧配置兼容 | API、store 测试通过 |
| 保存失败保留配置及不同代理隔离 | store 测试通过；组件保留草稿路径经代码检查 |
| 双编辑器绑定、DOM id 与已有值 | 服务端渲染测试通过 |
| 名称、字符串、NUL、重复键校验 | API 和解析测试通过 |
| 新启动/恢复、继承合并、空值、特殊字符 | 两类 launcher 测试通过 |
| Shell 命令转义与 Claude 函数回退 | shell 转义及模拟回退测试通过 |
| Codex 启动仅使用自身配置 | API 与 launcher 回归通过 |
| AI 文本生成按 provider 配置、显式参数优先 | agent-text 测试通过 |
| Claude preflight、嵌套 shell 检测 | 现有相关回归通过 |

## 执行检查

- 10 个相关 Vitest 文件、91 项测试全部通过：agent-environment、codex-environment-store、codex-environment-settings、codex-environment-api、agent-text、agent-text-process、codex-launcher-environment、claude-launcher-environment、claude-preflight、claude-session-detection。
- 完整 TypeScript 检查 `tsc --noEmit`：通过。
- 本次改动的 TypeScript/TSX 文件 ESLint：通过。
- 全仓 ESLint：未通过，已有 `tests/cli/features.test.cjs` 第 1–8 行触发 8 个 no-require-imports 错误；该文件本次未修改。
- `git diff --check`：通过。

## 环境与限制

当前工作树没有依赖目录，使用指向主工作树相同版本 node_modules 的本地链接。pnpm exec 自动触发安装并因非 TTY 拒绝清理依赖目录；未执行该清理，后续直接通过 Node 运行已有 Vitest、TypeScript 和 ESLint 入口。

未执行浏览器实机点击、真实 Claude/Codex 会话端到端启动或生产构建。桌面、移动端与服务端入口统一使用共享构建器，相关接线经源码检查；不能把此项视为实机验收通过。


## Review 修复后的复验

两个 P2 问题均已修复：完整后代进程扫描恢复深层真实 PID 绑定；shell 初始化后通过独立 fd 3 管道应用环境覆盖，保留标准输入且不把值写入命令行。

- 10 个相关测试文件、101 项测试全部通过（其中两个专项文件共 27 项）。
- 新增覆盖 3/5/8 层进程包装、无 PID 文件时的深层 resume 参数、重复/环形候选去重，以及无关 PID 排除。
- 使用本机 sh、bash、zsh、fish 子进程，在调用配置应用代码前设置冲突变量并定义 Claude 函数，确认配置优先、引号/反斜杠/换行/空值原样传递，以及原标准输入完整保留。测试隔离用户 rc 文件，显式模拟其初始化覆盖行为。
- 完整 `tsc --noEmit`、本次四个代码/测试文件 ESLint、`git diff --check` 均通过。
- 未运行真实 Claude 服务连接或浏览器端到端验收；全仓 lint 的既有问题仍见上文。


## rc 中 unset 代理变量的补充回归

当前启动器已在 shell 初始化之后通过 fd 3 再应用配置，无需移除 `-ilc`。移除交互式登录初始化会影响由 rc 定义的 Claude 函数或别名。

扩展四类 shell 子进程测试：初始环境携带 HTTPS_PROXY，在模拟 rc 初始化时执行 `unset HTTPS_PROXY`（fish 使用 `set -e HTTPS_PROXY`），确认有配置时恢复用户配置值、空配置时保持 unset。17 项启动器测试通过；此测试显式模拟初始化动作，不读取真实用户 rc 文件。

## export 前缀回归

3 个相关测试文件、50 项测试通过。覆盖前导空格/tab、export 与普通赋值混用、CRLF、空值、值中的等号及特殊字符、export/exported 合法变量名、无效前缀和混合形式重复键。11 种语言 settings.json 均可正常解析。


## Shell 引号可读性与参数边界复验

- 移除 String.fromCharCode，脚本使用 String.raw 与可直接审阅的引号/反斜杠字面量。
- 在 sh/bash/zsh/fish 中捕获前端启动命令和服务端恢复命令的实际 argv，确认启动器脚本与 workspace/resume 参数原样还原。测试值包含空格、单引号、反斜杠、$HOME、反引号、$(printf injected) 和换行；这些表达式未被展开执行。
- 四类 shell 的回退测试亦验证相同特殊参数按字面量传给 Claude 函数；补充 ~/ 路径仅在 Node 中按路径选项展开的测试。
- 10 个相关文件、116 项测试通过；完整类型检查、本次改动文件 ESLint、git diff --check 通过。


## Review 4–10 复验

- 配置根值为 null、数组、字符串、数字、布尔值均明确报错，不启动 Claude；文件描述符仍关闭。
- stat 显示超过 4 MiB 时不读取内容；文件在 stat 后增长时，实际读取也限制在 4 MiB + 1 字节并拒绝启动。
- 对 API 共享校验函数与启动脚本使用相同数据矩阵，校验结果一致，包含显式 null 环境字段。
- 代理文本执行与缓存返回均断言另一 provider 的专属键不存在；Claude shell 回退也有排除断言。
- 缓存验证并发合并、返回副本隔离、外部 change/rename、应用成功保存立即失效、失效期间在途读取、监听安装失败和运行错误后的回退。
- store 验证无变化及仅键顺序变化时不发 PATCH；显式 provider 映射保留类型检查。原编辑器本已禁用无改动保存，原模板 key 在当前 TS 版本也可推导为联合类型，本次属于额外加固。
- 11 个相关测试文件、138 项测试通过；完整 tsc --noEmit、本次改动文件 ESLint、git diff --check 通过。

缓存只用于 getAgentEnvironment / callAgentText，其他配置读取行为保持不变。未执行生产构建或真实服务端到端验收。


## 2026-09-30 边界复审验证

- 11 个相关测试文件、153 项测试通过。四类真实 shell 覆盖 fd 3 空流、截断、错误描述符拒绝启动；确认协议与超时使用可控定时器测试，验证管道写完但 shell 未确认仍会超时。
- 覆盖改名 Fish 能力探测、16 层/1024 候选/16 并发扫描边界、配置元数据不变时缓存不失效、超限读取/读取时增长/UTF-8 超限写入及修复后重试。
- 实际 Node 子进程 kill(pid, 0) 后不会提前触发 exit；正常退出仍为 (0, null)。export=value 的合法变量名回归保留，未引入解析放宽或未转义执行。
- 全量 Vitest：106 个文件中 105 个通过；766 项测试中 764 项通过、2 项失败。失败为未改动的 markdown-browser-compatibility.test.ts 中 autolink 依赖 lookbehind 与 surrogate-pair AST 输出检查；单独重跑仍复现。该文件只检查现有 Markdown 依赖，不导入本次改动模块。
- 完整 tsc --noEmit、本次改动文件 ESLint、git diff --check 通过。未执行真实 Claude 服务连接、浏览器验收或生产构建。
