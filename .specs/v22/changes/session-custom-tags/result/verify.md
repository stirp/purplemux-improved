# 应用验证记录

日期：2026-10-18。范围为本轮真实应用实现，不引用[历史原型验证](../result.md)作为应用运行结果。

## 自动化检查

以下相关测试共 108 项通过，覆盖标签事务、API、React 界面、状态兼容、存储、搜索、重连和工作区删除：

```bash
pnpm exec vitest run \
  "tests/unit/lib/session-tags.test.ts" \
  "tests/unit/lib/session-tags-api.test.ts" \
  "tests/unit/lib/session-tags-ui.test.ts" \
  "tests/unit/lib/session-workflow.test.ts" \
  "tests/unit/lib/session-workflow-storage.test.ts" \
  "tests/unit/lib/session-workflow-api.test.ts" \
  "tests/unit/lib/session-workflow-ui.test.ts" \
  "tests/unit/lib/session-workflow-menu.test.ts" \
  "tests/unit/lib/session-workflow-reconnect.test.ts" \
  "tests/unit/lib/session-search.test.ts" \
  "tests/unit/lib/session-layout-loading.test.ts" \
  "tests/unit/lib/workspace-delete.test.ts" \
  "tests/unit/lib/workspace-delete-api.test.ts"
```

UI 测试的 Provider 类型写法修正后，单独复跑 `pnpm exec vitest run "tests/unit/lib/session-tags-ui.test.ts"`，5 项通过。

- `pnpm exec tsc --noEmit`：完整 TypeScript 检查通过。
- `pnpm exec eslint <全部改动的 TS/TSX 源码和测试路径>`：通过。测试 Provider 的必填 children 类型与 ESLint 规则冲突使用局部注释说明，复跑该文件通过。
- `pnpm build`：退出码 0；Next.js 16.2.6 生产构建、post-build 和 tsup 均通过，无新增依赖。
- 文档相对链接、`depends_on` 路径和 11 个 locale 的 `tags` 键一致性检查通过。
- `git diff --check`：通过。

## 验收条件映射

| 验收条件 | 本轮证据与结果 |
| --- | --- |
| 多标签与关键词 AND、清空恢复 | React UI 测试和真实页面检查通过；状态分组仍使用原分类 |
| 标签与工作状态独立 | 同一标签关联进行中、审批中、已完成三个会话；删除标签后会话及状态不变 |
| 创建、编辑、改色、重名、删除 | 真实 API 和页面操作通过；重名表单原位报错；删除需确认；管理器独立新建“周期复盘”并选粉色成功 |
| 草稿取消、保存失败重试 | React UI 测试验证取消不请求、不写目录；500 后保留输入和创建 ID，重试一次提交 |
| 持久化、旧配置 | storage 测试通过；真实页面保存后读取隔离磁盘数据，刷新仍保留标签，筛选默认全部 |
| 并发冲突 | storage 测试验证锁内串行化和旧修订拒绝；真实页面模拟另一窗口更新，旧编辑器收到 409 并保留草稿，提示关闭重开 |
| 身份迁移、Tab 复用 | storage 测试验证首次绑定消费临时标签，复用不继承旧关联，新临时关联可独立迁移 |
| 删除/隐藏与迟到写入 | storage 测试验证清理关联、保留目录、隐藏身份不能重新写入；工作区删除相关回归通过 |
| 重连同步 | 自动化测试验证重连 workspace payload 携带目录、关联及修订号 |
| 桌面/移动、浅深色、键盘 | 真实浏览器检查通过，详见下文；手机真机未覆盖 |

## 真实应用浏览器检查

使用 agent-browser 独立 session `session-tags-app`，访问 `http://127.0.0.1:8137` 的真实 Next.js 页面与 API。测试进程通过 preload 将 `os.homedir()` 定向至 `/tmp/session-tags-app-check`，没有修改 HOME 或用户真实工作区数据；认证为隔离环境的本地测试凭据。测试使用三个历史会话样本，不启动真实 Agent。

- 桌面侧栏验证多选 AND、常驻助手跨状态显示、重命名及珊瑚色保存、删除确认与筛选恢复、刷新持久化。
- 编辑中模拟另一个请求更新目录，验证 409 提示和草稿保留。
- 390×844 检查移动列表、底部编辑器；320×740 检查编辑器和关闭后列表；430×932 检查筛选、管理、新建和深色编辑器。三个宽度均无页面横向溢出。
- 320px 编辑器宽 320px；430px 深色编辑器宽 430px；关闭、取消、保存操作触控高度为 44px。
- 320px 编辑器按 Escape 取消，父工作区抽屉保留，焦点回到“编辑周报助手的标签”按钮。
- 浏览器 session 与自用 Next dev 进程已关闭；随后执行生产构建，避免同时写入 `.next`。

截图均来自真实应用：

- [桌面多标签筛选](./app-desktop-filter.png)
- [390px 移动编辑器](./app-mobile-editor.png)
- [430px 深色编辑器](./app-mobile-dark.png)
- [并发冲突提示](./app-conflict.png)

## 实际限制

本次浏览器使用独立 `next dev`，未启动项目 custom server，终端和同步 WebSocket 不可用。因此验证结论覆盖真实页面、API、磁盘持久化和响应式布局；WebSocket 重连仅有自动化测试证据，未做完整服务的多设备实机验收。未覆盖手机真机软键盘、读屏器和跨浏览器兼容性。

中文与繁体中文新增文案已本地化；其他非英文语言的新增标签文案暂用英文。自动调度、周期提醒、后台常驻和会话保留策略不在本轮范围。

## Review 修复验证（2026-10-18）

本节为临时会话索引残留修正的独立运行结果。

- 修复前运行 `pnpm exec vitest run "tests/unit/lib/session-workflow-storage.test.ts" -t "consumes reused tab indices"`，三种场景均失败，实际索引比预期多出 `codex:tab:t`，确认回归测试复现评审问题。
- 修复后复跑本文件顶部所列的 13 个测试文件，**110 项全部通过**。三种场景均验证绑定后及关闭 Tab 后不残留临时索引，A 的标签与已完成状态保留；实际会话均具有原生导航身份，工作区汇总保持已完成。
- 本轮 `pnpm exec tsc --noEmit` 完整检查通过。
- 本轮 `pnpm exec eslint "src/lib/session-workflow.ts" "tests/unit/lib/session-workflow-storage.test.ts"` 通过。
- 本轮 `git diff --check` 和本需求文档相对链接检查通过。

此次仅调整已有身份协调函数的索引清理条件，使用存储层和列表/汇总派生函数的回归测试验证；未重新执行生产构建或浏览器验收，上文对应记录属于此前应用实施阶段。
