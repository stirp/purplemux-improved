# 实施与验证

2026-10-20，对应[规格](./spec.md)。

## 实施

- `src/lib/session-tags.ts`：增加 `reorder` 操作，要求完整、无重复且全部有效的目录 ID 排列；仅重排 `sessionWorkflow.tags`，保留标签内容、会话关联及工作状态。沿用现有修订校验、全局锁、原子保存和广播，不新增存储字段。
- `src/components/features/workspace/sortable-tag-row.tsx`：封装独立拖动手柄，复用项目 dnd-kit，支持鼠标、触控及键盘，移动端手柄为 44px。
- `src/components/features/workspace/session-tag-dialogs.tsx`：管理器保存本地排序草稿，显式保存或取消；搜索时禁用排序，草稿存在时禁用目录编辑，拖动及保存期间禁止关闭。拖动开始记录目录和 revision，远端修改或接口冲突后禁止保存，取消草稿后显示最新目录；其他保存失败保留草稿供重试。
- `src/hooks/use-session-tags.ts`：提供清除错误的方法，供取消草稿及重新排序使用。
- 11 个 `messages/*/notification.json` 补齐排序操作和提示，简繁中文本地化，其他语言沿用现有英文策略。
- 快捷筛选、筛选弹层、标签选择器继续读取共享目录数组，因此保存后自然获得统一顺序；会话卡片关联顺序保持原状。
- 复用排序库、保存流程和现有数组结构，排序行只负责拖动呈现，符合 KISS、DRY、单一职责原则；不增加无需求依据的排序模式或依赖。

## 自动化验证

首次实施运行以下命令；Review 修正后的检查另见文末：

```bash
pnpm exec vitest run "tests/unit/lib/session-tags.test.ts" "tests/unit/lib/session-tags-api.test.ts" "tests/unit/lib/session-tags-ui.test.ts" "tests/unit/lib/session-workflow-storage.test.ts" "tests/unit/lib/session-workflow-reconnect.test.ts" "tests/unit/lib/session-workflow-api.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/lib/session-tags.ts" "src/hooks/use-session-tags.ts" "src/components/features/workspace/session-tag-dialogs.tsx" "src/components/features/workspace/sortable-tag-row.tsx" "tests/unit/lib/session-tags.test.ts" "tests/unit/lib/session-tags-api.test.ts" "tests/unit/lib/session-tags-ui.test.ts" "tests/unit/lib/session-workflow-storage.test.ts"
git diff --check
```

- 默认并行配置下，6 个测试文件共 74 项通过、0 失败；完整 TypeScript 和上述 ESLint 通过。
- 校验覆盖完整排列、缺项、重复、未知、多余 ID、501 项上限和旧修订拒绝；成功排序保留名称、颜色、关联及工作状态，原输入不变。
- 存储测试覆盖读取往返、广播、过期修订和写入失败保留原顺序。文件系统使用测试替身，不代表真实磁盘联调。
- UI 测试覆盖草稿不写入、取消、关闭丢弃、保存后多个选择器同步、失败重试、拖动开始后的远端冲突和搜索禁用。测试通过捕获真实 DndContext 的事件回调驱动状态；真实传感器另由浏览器验证。
- 文档收尾另检查相对链接、依赖规格、11 个语言文件的新增键和差异格式。

## 浏览器验收

> Review 纠正：下表原键盘排序及 Escape 验收结论不足以证明焦点位于手柄时的行为。原代码没有处理 Base UI 对方向键和 Escape 的拦截，撤回这两项通过结论；原 UI 测试直接调用拖动回调，也不能作为真实键盘证据。修正后的复验结果另记在文末。

使用 agent-browser 会话 `tag-order-check` 访问 `http://127.0.0.1:8155` 隔离页面，挂载真实管理器、快捷筛选、Zustand、项目样式及 30 个标签。浏览器保存请求使用 fetch 替身调用真实 `applySessionTagUpdate`，未调用生产接口。

| 场景 | 结果 |
| --- | --- |
| 键盘排序 | 原通过结论撤回，见上方 Review 纠正及文末复验记录 |
| 鼠标排序 | 拖动手柄改变草稿顺序，可取消恢复 |
| 保存失败与重试 | 失败后草稿和错误提示保留；重试成功，两次请求内容相同 |
| 搜索 | 搜索“周报”后手柄禁用，提示清空搜索后排序 |
| 320×740 触摸模拟 | 通过 Chrome CDP 真实触摸事件完成拖动；手柄高 44px，页面无横向溢出 |
| 保存同步 | 触摸排序保存后，快捷筛选展示对应顺序，后续请求使用更新后的 revision |
| 320×296 低高度 | 管理弹窗高约 251.6px，列表仍有约 31px 滚动视区、内容高约 1901px；完成按钮底部 280px，在视口内。该尺寸无法同时展示完整一行，不作为完整触控拖动体验的验收依据 |
| 最终界面 | 最终代码重新打包后复验触摸排序，目视检查桌面浅色及移动深色截图 |

最终截图：[桌面排序草稿](./desktop-draft.png)、[移动排序草稿](./mobile-draft.png)。

## 验证边界

已完成真实组件的浏览器交互验证及相关自动化检查；未执行生产构建、完整服务保存联调、多设备联调或手机真机验收。本轮未提交、推送或发布，运行中的应用需要更新前后端代码后才能使用新增能力。

## Review 修正与复验

### 实施

- `TagModal` 将拖动与保存状态分开：两者都阻止关闭，但只有拖动期间的 Escape 调用 `details.allowPropagation()`，使传感器收到取消键。拖动期间对 ArrowUp/ArrowDown 调用 `event.preventBaseUIHandler()`，让键盘事件到达 document 上的真实 KeyboardSensor；其他弹窗及非拖动关闭规则沿用原行为。
- 管理器保存期间不将目录修订号变化渲染为冲突告警；明确的接口错误仍显示，保存完成后的真实修订冲突仍阻止覆盖。
- `tests/unit/lib/session-tags-ui.test.ts` 移除 DndContext 包装与回调注入，所有排序用例改为聚焦手柄后派发 DOM keydown。Dialog、DndContext、KeyboardSensor 均使用真实实现；仅补充 jsdom 缺失的行几何和 ResizeObserver。
- 新增 Escape 取消并保留既有草稿、空闲 Escape 关闭、保存中 Escape 不关闭、延迟同步不出现告警、服务端 409 保留草稿并禁止重试等断言。
- 新建 `src/lib/dnd-modifiers.ts`，标签管理、终端命令、快捷提示和侧边栏设置四处复用同一个垂直拖动 helper；不改变排序算法，不新增依赖。

### 失败复现及自动化结果

先在旧实现上运行真实键盘回归：排序后的目录仍是原顺序；Escape 后关闭按钮仍禁用。仅修复键盘传递后，两项通过，延迟同步用例在 `role="alert"` 应为空的断言失败，证实成功响应与同步完成之间存在假冲突。修复提示后，16 项标签 UI 用例通过。

最终默认并行配置回归：**7 个文件、90 项通过、0 失败**，包含终端命令 UI 对共享 helper 的回归。完整 TypeScript、以下改动文件 ESLint 和差异格式检查通过。

```bash
pnpm exec vitest run "tests/unit/lib/session-tags.test.ts" "tests/unit/lib/session-tags-api.test.ts" "tests/unit/lib/session-tags-ui.test.ts" "tests/unit/lib/session-workflow-storage.test.ts" "tests/unit/lib/session-workflow-reconnect.test.ts" "tests/unit/lib/session-workflow-api.test.ts" "tests/unit/lib/terminal-commands-ui.test.ts"
pnpm exec tsc --noEmit
pnpm exec eslint "src/lib/dnd-modifiers.ts" "src/components/features/workspace/session-tag-controls.tsx" "src/components/features/workspace/session-tag-dialogs.tsx" "src/components/features/workspace/terminal-commands-bar.tsx" "src/components/features/settings/quick-prompts-settings.tsx" "src/components/features/settings/sidebar-items-settings.tsx" "tests/unit/lib/session-tags-ui.test.ts"
git diff --check
```

### 本次浏览器复验

使用独立 agent-browser 会话 `tag-order-review`，在 `http://127.0.0.1:8155` 重新打包真实组件的隔离页面，保留 30 个标签。本次没有通过直接调用拖动回调完成任何排序。

| 操作 | 实际观测 |
| --- | --- |
| 聚焦“调整长期的顺序”，Space → ArrowDown → Space | 拿起及落下后检查 `document.activeElement` 均为该手柄；前三项从长期/周报/巡检变为周报/长期/巡检；保存排序可用，请求数为 0 |
| 同一手柄 Space → ArrowUp → Escape | 焦点仍在手柄，弹窗保持打开，关闭按钮恢复可用，原有周报/长期/巡检草稿保留，请求数仍为 0 |
| 暂停 `syncWorkspaces` 后保存 | 请求 revision 为 1，前两 ID 为 tag-1、tag-0；保存按钮禁用且显示“保存中…”，同步 Promise 保持挂起；MutationObserver 监测到的告警记录为空 |
| 同步挂起期间 Escape，再释放同步 | Escape 不关闭弹窗；释放后“完成”按钮恢复可用，顺序保留，整个过程中告警记录为空 |
| 鼠标按住周报手柄并移动，再按 Escape | 移动后关闭按钮禁用，焦点在周报手柄；Escape 后弹窗仍打开、关闭恢复可用，不生成新草稿，请求数仍为此前保存的 1 次 |

截图：[同步等待期间没有假冲突](./review-saving.png)。本轮键盘与鼠标取消行为以上述复验为准；前文移动触控及低高度截图为首次实施记录，本轮没有重新进行触控、手机真机或完整后端联调。保存及延迟同步使用隔离测试替身，未执行生产构建或发布。
