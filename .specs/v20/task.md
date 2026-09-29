# v20 任务进度

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
