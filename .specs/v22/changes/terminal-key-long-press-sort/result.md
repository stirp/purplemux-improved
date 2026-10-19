# 实施与验证记录

日期：2026-10-19。规格已补齐、代码已实现；以下是本次实际运行的结果。

## 实施

- `src/components/features/workspace/terminal-key-settings.tsx`：上下箭头替换为 44px 拖动手柄，触摸长按 350ms、提前移动超过 8px 取消激活，鼠标 5px 激活，支持键盘排序。原生纵向滚动、边缘自动滚动和拖动态反馈由现有 dnd-kit 提供。
- 勾选与手柄分离；拖动中禁止勾选、保存及关闭。复用已有 Base UI 键盘事件透传方式，Escape 只取消拖动。落点仅更新 react-hook-form 草稿，沿用保存、取消、失败重试和配置同步。
- `messages/*/terminal.json`：11 种语言更新长按操作说明及手柄名称，移除旧上移/下移文案键。
- `tests/unit/lib/terminal-keys-ui.test.ts`：使用真实 DndContext、传感器及 Dialog，补充触摸、鼠标、键盘和禁用状态回归，并将旧箭头用例更新为键盘拖动。
- KISS / DRY / 单一职责：复用既有依赖、保存协议及表单，以单独行组件封装排序绑定；不新增手势状态机、API、存储字段或依赖。

## 自动化检查

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run --maxWorkers=1 \
  tests/unit/lib/terminal-keys-ui.test.ts \
  tests/unit/api/terminal-keys.test.ts \
  tests/unit/lib/terminal-commands-ui.test.ts --testTimeout=15000
pnpm exec tsc --noEmit
pnpm exec eslint src/components/features/workspace/terminal-key-settings.tsx \
  tests/unit/lib/terminal-keys-ui.test.ts
git diff --check
```

- 最终 3 个文件、35 项测试全部通过，无未处理异常；完整 TypeScript 和 ESLint 通过。
- 初轮检查包含测试环境问题：并发资源竞争超时、使用普通 Event 模拟触摸导致坐标无法被真实传感器识别、向 document 派发鼠标释放触发 Base UI 非元素目标异常。改用 TouchEvent、实际手柄上的冒泡鼠标事件及单 worker 后全部通过，没有为通过测试替换实际排序逻辑。
- 11 种语言 JSON 可解析，新文案键及 `{name}` 占位符一致；规格相对链接和差异格式检查通过。

## 验收映射

| 验收项 | 本次证据 |
| --- | --- |
| 1 长按、鼠标、多行、无自动发送 | UI 测试覆盖 350ms 激活阈值、跨三行移动隐藏按键、鼠标下移及原位放下；浏览器 CDP 原生触摸将 Tab 从第一行移动到第四行，未发保存请求；桌面鼠标将其向上移回第一行。 |
| 2 滑动、取消及布局 | 浏览器从手柄提前滑动使列表 scrollTop 增加至 145，顺序不变；原生 touchCancel 保留草稿且可再次拖动；靠近底边自动滚动 250px。320×844、390×844、1024×844 下页面宽度等于视口宽度，保存按钮底边约 765px，长列表可滚动。 |
| 3 键盘及 Escape | UI 测试覆盖方向键移动、空格放下、原位放下、Escape 取消；浏览器真实键盘操作确认 Escape 结束拖动但弹窗保留、草稿顺序不变。 |
| 4 保存与异常 | UI 测试覆盖取消不保存、成功前不更新工具栏、保存中手柄禁用、失败保留排序/勾选草稿及重试、加载失败恢复、全部隐藏恢复；浏览器保存只产生一次草稿写入。 |
| 5 自动化及浏览器 | 35 项测试、完整类型、改动文件 ESLint、语言及链接检查通过；真实组件浏览器验证通过。 |

## 浏览器环境与限制

- 使用 agent-browser 独立会话 `terminal-key-sort` 和 Chromium CDP 原生输入。临时验证页 `http://127.0.0.1:18279` 直接打包本工作树真实 TerminalKeyBar、设置组件、NextIntlClientProvider 及项目 CSS；仅 fetch 使用内存替身，未写用户实际配置。
- [390px 设置弹窗截图](./mobile-settings.png)。测试页及 CDP 脚本位于 `/tmp/terminal-key-sort-nRAYLB`。
- 未执行 iPhone Safari / Android 实机、生产构建、完整应用端到端或真实服务端持久化与跨客户端刷新；本次未修改该数据通道。浏览器内存保存证据不等同于磁盘保存验收。
