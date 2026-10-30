# 实施与验证

日期：2026-10-31。规格：[spec.md](./spec.md)。

## 实施

- `src/hooks/use-layout.ts`：切换时复用已有工作区布局缓存，恢复浏览器有效焦点和终端比例/折叠状态，再后台校验。缓存只作为即时展示来源，服务端仍负责持久化及最新布局。
- 当前布局在 store 订阅中同步缓存，避免组件卸载前尚未执行 effect 而丢失最新本地选择；`use-workspace-layouts.ts` 移除重复缓存 effect。
- `useLayout` 在目标工作区与 store 身份不一致时不暴露旧布局。冷工作区继续等待请求；暖工作区刷新失败保持可见并 Toast 提示，不回退到自动创建 Pane 或跳回原工作区。
- 中止旧布局请求，对延迟成功/失败及 Tab/Pane 焦点保存响应增加切换代次保护。显式目标 Tab 可从缓存先展示，用户之后选择其他 Tab 时撤销旧导航目标。
- `src/lib/timeline-tool-groups.ts` 从 `timeline-view.tsx` 提取原有工具转换和分组逻辑。以不可变条目/数组为 WeakMap 键复用计算，追加消息或缓存切回不再重算未变化补丁的 `diffLines`。没有改变补丁算法、工具输出、顺序或展开规则。
- 修正导航回归测试的缓存隔离：新实现会同步保存布局，测试间必须一并恢复工作区布局缓存，避免上个用例的 Tab 被当作本次已存在 Tab。

KISS/DRY：复用现有布局缓存及存储偏好，不新增持久化配置或连接保活。工具分组独立承担纯计算职责，弱引用随源数据回收，不额外长期持有会话。

## 验收映射

| 验收 | 本次证据 |
| --- | --- |
| 1：布局请求未完成即可显示暖工作区，冷工作区不串内容 | `workspace-switch-performance.test.ts` 挂载真实 React hook，网络 Promise 保持未完成时已显示 `pane-b`，任何一次 render 均不出现 `pane-a`；另测冷工作区 |
| 2：恢复本地状态、目标导航和后台校验 | A → B → A、Tab/Pane 焦点、终端比例/折叠、显式目标、最新手选 Tab、服务端删除 Tab 用例 |
| 3：旧请求隔离、失败恢复 | 延迟成功/失败、旧 Tab/Pane PATCH、切回原工作区、连续三次刷新失败不新建 Pane、恢复刷新及无工作区用例 |
| 4：减少重复计算且输出兼容 | `timeline-tool-groups.test.ts`：缓存命中、追加、同 ID 新对象、状态变化、工具配对及分组、补丁详情和空补丁；80 个补丁连续分组 21 次只调用 80 次 `diffLines` |
| 5：工程检查 | 下列命令及结果；未执行浏览器/移动真机端到端性能验收 |

## 自动化检查

`pnpm exec vitest run` 分三组执行以下文件，共 18 个文件、178 项通过：

```text
tests/unit/lib/workspace-switch-performance.test.ts
tests/unit/lib/timeline-tool-groups.test.ts
tests/unit/lib/session-workspace-navigation.test.ts
tests/unit/lib/session-layout-loading.test.ts
tests/unit/lib/timeline-display-cache.test.ts
tests/unit/lib/timeline-display-hook.test.ts
tests/unit/lib/new-tab-picker.test.ts
tests/unit/lib/workspace-item-render.test.ts
tests/unit/lib/session-workflow-ui.test.ts
tests/unit/lib/terminal-input-isolation.test.ts
tests/unit/lib/timeline-turn-pagination.test.ts
tests/unit/lib/timeline-server-initial-delivery.test.ts
tests/unit/lib/layout-close-pane-focus.test.ts
tests/unit/lib/layout-empty-workspace.test.ts
tests/unit/lib/layout-tab-creation-client.test.ts
tests/unit/lib/layout-tab-creation-callers.test.ts
tests/unit/lib/layout-tab-rename.test.ts
tests/unit/lib/workspace-expansion-navigation.test.ts
```

- 首组初次执行发现两个导航测试缓存串用，补齐测试隔离后复测通过；加入“手选 Tab 撤销旧导航目标”用例后首组最终 73 项通过。第二、三组分别 62、43 项通过。
- `pnpm exec tsc --noEmit`：完整类型检查通过，最终源码复核通过。
- `pnpm exec eslint`：4 个源码文件及上述新增/修改的 3 个测试文件全部通过。
- `pnpm build`：通过 Next.js 类型检查、生产编译、24 个静态页面生成、post-build 和 tsup 服务端打包。首次被临时共享依赖符号链接超出 Turbopack root 阻止；移除本次创建的链接，执行 `pnpm install --frozen-lockfile --ignore-scripts --offline` 建立本地依赖后重试成功。锁文件和依赖声明未修改。
- `git diff --check`：通过；本需求 Markdown 链接及 `depends_on` 路径检查通过。

## 性能证据与限制

[原始测量](./benchmark.json)：在同一 Node 进程中，提取基线提交 `74949ffa41bc6172e060e6758840ac894797bf8a` 的原始 `groupTimelineEntries`，经 TypeScript 转译后，与当前模块比较。数据为 80 个补丁，每个 120 行替换；首次分组后，使用新数组和同一批不可变条目重复分组 20 次。

| 场景 | 基线 | 本次 |
| --- | ---: | ---: |
| 首次分组 | 464.52 ms | 431.10 ms |
| 20 次重复分组合计 | 8218.61 ms | 1.12 ms |

这是一次合成计算微基准，包含运行时波动，不是浏览器切换总耗时或 p95。首次差异计算复杂度没有改变；后台收到新对象的服务端 init 仍需计算。真实长消息 Markdown 渲染、网络等待、进程检测与终端握手没有本次端到端测量。

布局收益通过未完成请求的组件测试证明：有缓存时去除了布局网络等待这个串行前置条件，并没有假定网络固定耗时或承诺每次切换毫秒数。

本次未部署、重启运行服务或执行 Git 提交/推送；当前运行实例需采用这份代码后才会生效。

## Review 修复与本轮验证

针对 `claude-code-review` 指出的三个问题，在本需求规格中补齐验收 6–8 后实施修复：

| 问题 | 修复入口和行为 | 新增回归 |
| --- | --- | --- |
| 旧导航目标在 GET 返回后抢回 Pane 焦点 | `use-layout.ts` 的 `focusPane` 校验目标有效性，并在用户选择有效 Pane 时撤销旧目标；重复选择当前 Pane 也生效且无需 PATCH | 未变化和变化布局两条响应路径均保持新焦点；无效 Pane 不撤销目标，重选当前 Pane 撤销目标 |
| 相同 Pane/Tab 树时遗漏 Git 面板设置更新 | 布局内容比较纳入 `diffSettings`，设置更新或清除时应用完整响应及 `updatedAt`，继续保留有效焦点 | 设置更新和清除两个用例，同时检查共享缓存、时间戳及活动 Pane/Tab |
| 移动端预取未参与布局恢复 | `mobile-layout.tsx` 的预取、菜单刷新、Tab 排序使用共享布局缓存；删除私有缓存及渲染期间的复制；响应仅在请求时的缓存尚未被替换时写入 | 挂载真实 `MobileLayout` 与 `useLayout` 内容探针，首次切换已预取工作区时不等待 GET；菜单显示共享缓存更新，延迟刷新不覆盖新缓存 |

KISS/DRY：沿用现有 `useWorkspaceLayoutStore`，移除移动端重复状态，不新增缓存层、设置或接口。通过请求开始时的缓存对象身份检查避免旧响应覆盖新状态。

本轮实际执行结果（不沿用上文首次实现的 178 项作为本轮证据）：

- 修复前运行 `pnpm exec vitest run tests/unit/lib/workspace-switch-performance.test.ts tests/unit/lib/session-layout-loading.test.ts`：新增 7 项全部失败，原有 14 项通过。失败分别为 Pane 焦点回跳/无效选择、设置更新与清除丢失、移动端等待布局和共享标题不更新。
- 修复后运行同一命令：21 项全部通过。
- 扩展回归使用 `pnpm exec vitest run`，重新执行上文列出的 18 个文件，以及 `tests/unit/lib/mobile-workspace-expansion.test.ts`、`tests/unit/lib/mobile-group-touch-drag.test.ts`：共 20 个文件、212 项通过。
- `pnpm exec tsc --noEmit`：完整类型检查通过。
- `pnpm exec eslint`：通过。检查文件为 `src/hooks/use-layout.ts`、`src/hooks/use-workspace-layouts.ts`、`src/components/features/mobile/mobile-layout.tsx`、`src/components/features/timeline/timeline-view.tsx`、`src/lib/timeline-tool-groups.ts`，以及 `workspace-switch-performance`、`timeline-tool-groups`、`session-workspace-navigation`、`session-layout-loading` 四个改动测试文件。
- `pnpm build`：通过 Next.js 类型检查、Turbopack 生产编译、静态页面生成、post-build 和 tsup 服务端打包，退出码 0。
- `git diff --check` 及本需求 Markdown 链接、`depends_on` 路径检查通过。

移动端测试使用 jsdom，标题栏和底部 Tab 条有 mock，内容由真实 `useLayout` 探针承载；不是完整移动端页面或真机端到端验收。本轮未执行浏览器/真机耗时测量、未重跑合成性能基准，未部署或重启服务。
