# 验证记录

日期：2026-10-17。

## 自动化检查

以下均为本次实际执行结果：

```bash
pnpm exec vitest run \
  tests/unit/lib/workspace-sidebar-search.test.ts \
  tests/unit/lib/mobile-workspace-expansion.test.ts \
  tests/unit/lib/workspace-visibility.test.ts \
  tests/unit/lib/workspace-item-render.test.ts \
  tests/unit/lib/workspace-touch-menu.test.ts \
  tests/unit/lib/workspace-search.test.ts \
  tests/unit/lib/workspace-tree-position.test.ts \
  tests/unit/lib/session-workspace-navigation.test.ts \
  tests/unit/lib/navigation-drag.test.ts \
  tests/unit/lib/touch-drag.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint \
  src/lib/workspace-order.ts \
  src/hooks/use-workspace-expansion.ts \
  src/components/layout/sidebar.tsx \
  src/components/features/workspace/workspace-item.tsx \
  src/components/features/mobile/mobile-navigation-sheet.tsx \
  tests/unit/lib/workspace-visibility.test.ts \
  tests/unit/lib/mobile-workspace-expansion.test.ts \
  tests/unit/lib/workspace-sidebar-search.test.ts
git diff --check
```

- 相关测试：128 通过，0 失败。
- 完整 TypeScript：通过。首次在测试调用尚未适配新函数签名时发现两处错误，更新测试后完整复跑通过。
- 改动文件 ESLint：通过，无警告。中途发现选择回调不稳定警告，改用 useCallback 后消除；最后仅调整注释与 JSX 排版的两个文件也重新通过 ESLint。
- 差异格式：通过。
- 使用 `pnpm install --frozen-lockfile` 安装现有依赖；包文件与锁文件未修改。

## 验收映射

| 标准 | 本次证据 | 结果 |
| --- | --- | --- |
| TE-01 | 实际 Sidebar DOM 测试验证按钮点击不切换、双击不改名、SVG dragstart 被取消；浏览器 Enter/Space 激活；空叶子无按钮 | 通过 |
| TE-02 | 桌面 DOM、移动交互测试及浏览器同时打开 A、A1、A2、B；选择 B1 不收起 A | 通过 |
| TE-03 | 单测与浏览器收起 A 后 A1/A11/A2/A21 隐藏，B1 保留；重开 A 恢复内部展开状态，活动项目不被箭头改变 | 通过 |
| TE-04 | 单测覆盖外部切到 A11 时追加揭示、列表同步保留手动收起、孤儿/循环/输入乱序；既有会话导航回归通过 | 通过 |
| TE-05 | 两端搜索 A11、点击结果并清空，A 恢复收起且 B 保持展开；移动三种搜索点击回归通过 | 通过 |
| TE-06 | 移动空项目选择、Tab 导航与多树回归；浏览器关闭再打开抽屉保留 A 收起/B 展开；菜单及触摸相关测试通过 | 通过 |

## 浏览器检查范围

使用 agent-browser 独立会话 `workspace-expansion-wsdp`。当前 CLI 不提供 `skills get core`，因此读取本地 core/SKILL.md 作为操作指南。

临时脚本 `/tmp/workspace-independent-expansion-preview.cjs` 使用当前工作树的真实 Sidebar、MobileNavigationSheet、WorkspaceItem、共享 Hook/Store 与全局 CSS 打包，在 `http://127.0.0.1:8159` 展示虚构项目。路由、网络响应、工作区布局查询、通知与配额面板被隔离替换；没有接触真实项目配置。

- 桌面：240px 侧栏显示 A/B 两棵树；点击 A1/A2/B 箭头后七个节点同时可见，活动项目仍为 A，网络记录无写请求。Enter 收起 A 后只剩 A/B/B1，Space 恢复七个节点。
- 桌面搜索：先收起 A，搜索 A11，箭头禁用；选择 A11、清空后恢复 A/B/B1。仅有选择项目原有的 `/api/workspace/active` PATCH，没有展开状态写入。
- 移动：390×844 视口，打开 A1 与 B 后 A11/B1 同时可见；收起 A 后关闭并重开抽屉，A 仍收起、B 仍展开。搜索 A11 并选择，清空后恢复原树；重新打开 A 恢复 A1 展开及 Tab，点击“终端 A”触发导航并关闭抽屉。无页面横向溢出。
- 已检查本次截图 `/tmp/workspace-independent-expansion-desktop.png` 与 `/tmp/workspace-independent-expansion-mobile.png`，树线、箭头和名称正常。

这是当前真实组件的隔离浏览器验收，不等同于完整应用端到端、真实网络重连或 iOS/Android 实机验收。本次未运行生产构建；浏览器覆盖本次 UI 变更，重连保留状态由同步回归与源码检查确认。

## 审查修正验证

日期：2026-10-17。本节为本轮重新执行的结果，不引用前一轮通过数作为修复证据。

### 问题复现与自动化

- 修复前先运行新增回归文件，5 项中 3 项失败：旧回调在新节点已入列表后调用，同 ID 快捷键导航，同 ID Sessions 导航。目标先请求后到达和搜索保护两项已通过。
- 修复后增加导航视图挂载前的待处理请求、搜索清空后异步选择完成、移动行内收起后异步选择完成三项边界；新文件共 8 项。
- 最终运行上方列出的 10 个测试文件，加上 `tests/unit/lib/workspace-expansion-navigation.test.ts`：**136 通过，0 失败**。
- 重新执行 `pnpm exec tsc --noEmit`：通过。
- 重新执行改动文件 ESLint，文件为上方列表加 `src/hooks/use-sidebar-actions.ts`、`tests/unit/lib/workspace-expansion-navigation.test.ts`：通过，无错误或警告。
- 新测试最初在 render 中保存 Hook 结果被 react-hooks/globals 提示，改为提交阶段的 useLayoutEffect 观测；最终检查通过。

| 验收 | 新回归与本轮结果 |
| --- | --- |
| TE-07 旧新建回调 | 捕获旧回调，父节点收起，分别在请求前/后加入新节点；两种场景均显示新节点、祖先及其他已展开项目 |
| TE-07 晚挂载 | 先提交未知节点的请求，再挂载导航并同步节点；请求未丢失，路径可见 |
| TE-08 快捷键 | 调用真实 useGlobalShortcuts 注册的 workspace.switch 处理器，连续两次选择同一活动 ID；每次均揭示，普通列表同步仍保持手动收起 |
| TE-08 Sessions | 调用真实 navigateToSession 进入当前工作区的已有会话，连续两次均揭示目标路径 |
| 搜索兼容 | 搜索期间选择同 ID，清空后不揭示；异步选择在清空后完成也不改变原收起状态 |
| 移动收起 | 公共选择入口显式跳过揭示，异步完成后仍保持祖先收起，其他项目不受影响 |

### 本轮浏览器

独立 agent-browser 会话 `workspace-expansion-review`，临时脚本 `/tmp/workspace-expansion-review-preview.cjs`。继续使用真实组件和 Store；虚构数据、网络/路由隔离方式与上节一致，脚本额外暴露公共选择入口与展开请求用于模拟导航完成。

- 桌面：活动 ID 为 a11，手动收起 A，再调用公共选择入口选择 a11；ID 不变，A/A1/A11 重新可见，B/B1 保持展开。
- 桌面旧回调：收起 A，保存旧展开回调，向最新 Store 添加 A1 下的新节点，再调用旧回调并选中新节点；新节点、A/A1 及 B/B1 均可见。
- 移动 390×844：搜索选择 A11 后清空，活动 ID 为 a11，导航恢复为收起的 A 和展开的 B/B1；再次调用公共选择入口选择 a11，A/A1/A11 重新可见，B/B1 保留。
- 浏览器覆盖上述导航交互；晚挂载请求与异步完成边界以最终 React/Zustand 回归验证。未执行生产构建、完整应用端到端或移动实机验收。
