# 验证记录

## 自动化

执行命令：

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/lib/session-workspace-name.test.ts tests/unit/lib/session-search.test.ts tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/agent-session-title.test.ts tests/unit/lib/session-workspace-navigation.test.ts tests/unit/lib/session-workflow.test.ts tests/unit/lib/session-workflow-menu.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/components/features/workspace/notification-sheet.tsx src/components/features/workspace/session-history-actions.tsx src/lib/session-workspace-name.ts src/lib/session-search.ts tests/unit/lib/session-workspace-name.test.ts tests/unit/lib/session-workflow-ui.test.ts tests/unit/lib/session-workflow-menu.test.ts
git diff --check
```

- 相关测试 **80 项通过**；覆盖多层根项目、根项目改名、空白及目录回退、孤儿和循环、三类信息显示和搜索、手动 Tab 名称、共享标题、历史身份隔离、搜索折叠恢复、导航、状态保存失败、删除按钮隔离及长按/右键。
- 最终项目路径换行样式调整后，额外重跑 workflow-ui 与 workflow-menu，**23 项通过**。
- 完整 TypeScript、改动 TS/TSX 文件 ESLint 通过。
- 规格链接 10 处及 11 份语言文件键检查通过；`git diff --check` 通过。
- 首轮测试发现旧测试使用 `rounded-md` 样式定位行、依赖计数括号；已改为稳定导航属性及新的计数表达。保留“当前会话不重复导航”的原有断言，最终通过。
- 锁定依赖安装成功，包文件与锁文件未修改；已读取本地 Next.js Pages/Layouts 指南。

## 浏览器检查

使用 agent-browser 独立会话，在 `127.0.0.1:18736` 加载实际 `NotificationPanel`、真实 Base UI 删除确认组件、项目 CSS 和中文词条。通过 esbuild 与 PostCSS 编译；夹具在 `/tmp/session-project-hierarchy-preview`，仅注入模拟项目、Tab、历史数据，导航记录到内存，网络写请求返回 500，不连接真实工作区数据。

| 验收 | 本次结果 |
| --- | --- |
| 三类信息及主次层级 | 390px 浅色/深色截图检查通过；运行中、审批中和选中卡片均显示根项目、项目、标题 |
| 根项目搜索 | 输入 purplemux 返回 3 个会话，所属较早记录自动显示；清空恢复折叠 |
| 移动热区 | DOM 实测搜索、分类、状态选择、删除均为 44px；清空及历史入口使用 44px 样式 |
| 点击隔离 | 点击删除只打开确认框，导航记录为空；未执行删除 |
| 键盘导航 | 聚焦会话按钮后 Enter 成功记录目标原生会话 ID |
| 窄屏布局 | 320/390/430px 下无页面或卡片横向溢出 |
| 长名称和文字放大 | 320px、长无空格英文根名、长中文项目名、根字号 32px 下无横向溢出，列表仍有 320px 可滚动高度 |
| 桌面窄侧栏 | 1280px 视口内 240px 侧栏，长名称无横向溢出 |
| 浏览器错误 | agent-browser errors 未发现运行错误 |

截图：

- [390px 浅色](./mobile-390.png)
- [390px 深色](./mobile-390-dark.png)
- [320px 长名称](./mobile-320-long.png)

## 限制

浏览器检查为真实组件的隔离夹具，不等同于完整应用登录态侧栏或真机验收。未执行 iOS/Android 实机、软键盘、安全区、读屏、后端状态同步重连及生产构建；本次用实际组件浏览器编译、检查和相关回归测试验证展示改动。未知根项目是既有数据缺少可追溯关系时的明确回退，不代表补齐了历史根关系快照。

夹具未提供终端 Meslo 字体和 favicon 静态资源，对应请求返回 404；截图使用浏览器可用字体，不作为应用自定义字体的验收证据。
