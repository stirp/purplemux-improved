# 实施与验证记录

## 实施

2026-10-17，先新增本需求规格，再实现修复。

- 根因：移动端分组标题未绑定 draggable 和 drag/drop 事件，移动导航的共享拖拽模型也缺少 group 类型。列表虽已绑定 useTouchDrag，仍无法识别分组为拖动源。
- `src/hooks/use-navigation-drag.ts`：增加 group 类型，只允许同类型不同对象之间排序，保留 Tab 的工作区和 pane 边界。
- `src/components/features/mobile/mobile-navigation-sheet.tsx`：为分组绑定共享拖拽属性，通过 reorderNavigationIds 计算位置并调用既有 reorderGroups；搜索期间关闭拖拽。
- `src/components/features/mobile/mobile-workspace-group-header.tsx`：将拖拽属性绑定到标题按钮本身，覆盖名称、箭头及计数；更多按钮独立，抑制标题原生长按菜单。
- 复用现有 350ms 长按、8px 滚动取消阈值、插入线、释放点击保护及保存失败恢复；没有新增依赖、API 或配置字段。通过最小接入复用已有职责，避免复制手势状态机。

## 自动化验证

以下为本次实际运行结果：

```sh
pnpm exec vitest run tests/unit/lib/mobile-group-touch-drag.test.ts tests/unit/lib/navigation-drag.test.ts tests/unit/lib/touch-drag.test.ts tests/unit/lib/workspace-group-order.test.ts tests/unit/lib/workspace-touch-menu.test.ts tests/unit/lib/mobile-workspace-expansion.test.ts tests/unit/lib/workspace-sidebar-search.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/hooks/use-navigation-drag.ts src/components/features/mobile/mobile-navigation-sheet.tsx src/components/features/mobile/mobile-workspace-group-header.tsx tests/unit/lib/navigation-drag.test.ts tests/unit/lib/mobile-group-touch-drag.test.ts
git diff --check
```

- 7 个测试文件，共 98 项通过、0 失败。
- 完整 TypeScript 检查通过。
- 改动文件 ESLint 通过。
- 差异格式检查通过。
- `pnpm build`：通过，Next.js 编译、24 个静态页生成、post-build 及 tsup 服务端构建全部成功。
- 本需求文档相对链接和 depends_on 路径检查通过。

## 验收映射与限制

| 条件 | 证据 |
| --- | --- |
| GT-01 | 真实 MobileNavigationSheet、标题按钮、共享 hook 和 store 的 jsdom 组件测试，覆盖向上/向下、空组/折叠组、拖动反馈、PATCH 请求及成员关系；既有 store 测试覆盖保存失败提示与刷新恢复 |
| GT-02 | 组件测试覆盖短按、滚动、菜单首个改名操作、释放点击抑制、touchcancel、多指、卸载、自己及工作区非法目标；纯函数测试覆盖 Tab 类型隔离 |
| GT-03 | 组件测试覆盖搜索期间禁拖及清空恢复、鼠标原生拖拽事件；既有工作区触摸菜单、展开、搜索和 Tab 排序逻辑回归通过。桌面分组源码未修改 |
| GT-04 | 类型检查、Lint、相关测试及生产构建通过 |

组件测试使用合成触摸事件、模拟 DataTransfer 和坐标命中；HTTP 请求为 mock，没有修改用户工作区数据。未执行真实浏览器、iOS/Android 真机触摸、真实后端持久化及重连验收；不将 jsdom 结果视为真机通过。
