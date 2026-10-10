# v20 任务进度

## Linux CLI 安装入口修复（2026-10-10）

- [x] [需求](./requirements/single-cli-install.md)及 fork-platform 规格更新：仅注册 purplemux-improved。
- [x] 删除 purplemux/pmux bin 别名，同步 CLI 帮助、Claude/Codex 提示、README 和多语言安装/CLI 文档。
- [x] 实际 tarball 元数据验证、61 项 CLI 回归、2 项 Codex 提示测试、完整 TypeScript 和改动代码 ESLint 检查通过；CommonJS 文件关闭不适用的 require 禁止规则。
- [ ] 用户 Linux 全局安装与现有旧命令归属检查（本次未执行）。

详见[实施记录](./result/build-single-cli-install.md)及[验证记录](./result/verify-single-cli-install.md)。

2026-10-05：[AI 生成超时兼容](./requirements/ai-git-generation-timeout.md)已实现；6 文件 52 项测试、完整 TypeScript、改动文件 ESLint、Next.js 和服务端构建通过；浏览器/实际网关验收未执行。详见[验证记录](./result/verify-ai-git-generation-timeout.md)。

v20 是现有 fork 功能回补规格。下表的实现状态来自当前源码检查，不代表本次执行了构建或功能测试。

| feature | phase | priority | build | verify | updated |
| --- | --- | --- | --- | --- | --- |
| [workspace-management](./features/workspace-management/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [worktree-lifecycle](./features/worktree-lifecycle/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [worktree-organization](./features/worktree-organization/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [worktree-sync-delivery](./features/worktree-sync-delivery/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [ai-branch-naming](./features/ai-branch-naming/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [ai-git-writing](./features/ai-git-writing/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [queued-input](./features/queued-input/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [session-lifecycle](./features/session-lifecycle/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [interactive-questions](./features/interactive-questions/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [agent-progress](./features/agent-progress/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [native-commands](./features/native-commands/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [agent-runtime](./features/agent-runtime/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [timeline-history](./features/timeline-history/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [editor-diff-navigation](./features/editor-diff-navigation/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [mobile-navigation](./features/mobile-navigation/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [terminal-rendering](./features/terminal-rendering/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [browser-recovery](./features/browser-recovery/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [attachments](./features/attachments/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |
| [fork-platform](./features/fork-platform/spec.md) | 累计功能回补 | P0（文档覆盖） | 源码已存在；本次未构建 | 规格及引用检查；运行验收未执行 | 2026-09-28 |

详见[实施记录](./result/build.md)和[验证记录](./result/verify-1.md)。

## 新增需求待办

此表单独跟踪历史回补范围之外的新增需求。

| feature | phase | priority | build | verify | updated |
| --- | --- | --- | --- | --- | --- |
| [无同步目标时默认当前分支](./requirements/sync-target-current-branch.md) | 已实现 | P2 | 代码完成；未执行生产构建 | 51 项相关测试通过；[验证记录](./result/verify-sync-target-current-branch.md) | 2026-09-29 |

- [x] 服务端支持当前分支候选、默认回退与只读比较，保留同分支同步执行保护。
- [x] 弹窗展示与候选勾选一致，自身目标时禁用 merge/rebase。
- [x] 补充默认优先级与边界场景回归测试，验证共享弹窗的交互逻辑。
- [ ] 桌面和移动端实机验收（本次未执行）。

## 按代理环境配置

- [x] 需求与 agent-runtime 详细规格同步。
- [x] 独立配置、共享编辑器、启动和恢复、AI 文本调用。
- [x] 153 项相关测试、完整类型检查、改动文件 lint；[验证记录](./result/verify-per-agent-environment.md)。
- [ ] 浏览器与真实代理端到端验收（本次未执行）。

- [x] 修复 review 两项 P2：多层包装进程绑定、登录 shell 初始化后的环境覆盖优先级；四类 shell 子进程回归通过。

- [x] export 前缀兼容及可审阅 Shell 转义；前后端数组参数边界和四类 shell 回归通过。

- [x] Review 4–10：配置根值与大小防护、共享校验、文本调用缓存、专属键隔离断言、显式字段映射及无变化保存跳过。

- [x] 2026-09-30：fd 3/4 完整性握手与超时、扫描深度/数量/并发限制、Fish 能力探测、配置读写大小对齐及文件元数据缓存失效；全量测试的两项无关失败已记录。

## 区域字体设置（2026-10-03）

| feature | phase | build | verify | updated |
| --- | --- | --- | --- | --- |
| [region-typography](./features/region-typography/spec.md) | 新增功能；规格回补完成 | 代码已实现；Next.js 构建通过；完整打包未执行 | 25 项相关测试、完整类型检查及改动文件 lint 通过；实机待验收 | 2026-10-03 |

- [需求](./requirements/region-typography.md)
- [实施记录](./result/build-region-typography.md)
- [验证记录与检查边界](./result/verify-region-typography.md)
- 根目录 [AGENTS.md](../../AGENTS.md)新增强制按 spec 开发的顺序、状态和证据规则。

### 区域字体 Review 修复

2026-10-03：RT-10 至 RT-17 对应修复已实现；5 个相关文件共 38 项测试、完整类型检查、改动文件 lint 和 Next.js 构建通过；真实浏览器视觉验收待执行。

### 区域字体架构复审（2026-10-05）

RT-18 至 RT-23 已实现。11 个相关测试文件共 84 项通过；完整 TypeScript、改动文件 ESLint、Next.js 构建和服务端 tsup 构建通过。
store 保持扁平结构，配置改为安全快照同步，区域改为 CSS 变量，终端恢复 props 驱动。
真实浏览器视觉及跨设备验收未执行，详见最新验证记录。

### Sessions 导航同步侧边栏项目（2026-10-08 复审）

规格和代码已修正为仅历史入口定位、复用项目选择处理器、临时展开分组、不改折叠偏好；测试完整隔离并覆盖非 Sessions 路径。3 文件 34 项测试、完整 TypeScript 和改动文件 ESLint 通过；本次构建类型检查及编译通过，页面数据收集仍因 `/login` 的 `self is not defined` 失败。浏览器/实机验收未执行。详情见 [验证记录](./result/verify-session-workspace-navigation.md)、[需求](./requirements/session-workspace-navigation.md)和[实施记录](./result/build-session-workspace-navigation.md)。
