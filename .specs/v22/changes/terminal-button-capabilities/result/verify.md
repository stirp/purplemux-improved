# 验证记录

日期：2026-10-18。以下结果均为本次任务实际运行；规格状态 DETAILED 不代替验证结论。

## 自动化检查

最终运行：8 个文件、109 项测试通过。

```bash
pnpm exec vitest run --maxWorkers=2 \
  tests/unit/lib/terminal-keys-ui.test.ts \
  tests/unit/api/terminal-keys.test.ts \
  tests/unit/lib/terminal-commands-ui.test.ts \
  tests/unit/api/terminal-commands.test.ts \
  tests/unit/lib/terminal-commands-storage.test.ts \
  tests/unit/lib/config-sync-hook.test.ts \
  tests/unit/lib/session-workflow-storage.test.ts \
  tests/unit/lib/workspace-reorder.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint \
  src/components/features/workspace/terminal-key-bar.tsx \
  src/components/features/workspace/terminal-key-settings.tsx \
  src/components/features/workspace/terminal-commands-bar.tsx \
  src/components/features/mobile/mobile-terminal-toolbar.tsx \
  src/hooks/use-terminal-keys.ts src/hooks/use-sync.ts \
  src/lib/terminal-keys.ts src/lib/terminal-custom-commands.ts \
  src/lib/workspace-store.ts src/types/terminal.ts \
  src/pages/api/terminal-keys.ts \
  tests/unit/lib/terminal-keys-ui.test.ts tests/unit/api/terminal-keys.test.ts \
  tests/unit/lib/terminal-commands-ui.test.ts tests/unit/api/terminal-commands.test.ts \
  tests/unit/lib/terminal-commands-storage.test.ts
git diff --check
```

- 完整 TypeScript、改动文件 ESLint（零警告）、差异格式检查通过。
- 初轮命令 UI 的两条断言需要包含新增的 `autoEnter: true`；新增复选框测试的 jsdom 环境缺少 PointerEvent，补齐 MouseEvent 模拟后通过。早期并发检查出现超时，最终限制 2 个测试 worker，109 项全部通过，无未处理异常。
- 11 种语言 JSON 解析、键集合和变量占位符一致性，以及本需求 Markdown 相对链接检查通过。

## 验收映射

| 验收项 | 本次证据 |
| --- | --- |
| 1 默认按键、排序、隐藏与持久化 | UI 测试覆盖默认值、取消、保存成功才更新；存储测试重读文件。浏览器鼠标下移 Tab、隐藏 Esc、刷新后保留；聚焦“上移 Ctrl”后用 Enter 排序，API 前四项为 Esc（隐藏）、Ctrl、Tab、Shift。切换手机尺寸沿用同样顺序，并将 F12 移到 F11 前。 |
| 1 全部隐藏与同步 | 独立 HTTP 客户端 PUT 全部隐藏，已打开的浏览器通过广播立即收起所有按键，设置入口仍在；再从弹窗勾选 F12 并保存，API 与按钮栏均只显示 F12。 |
| 2 功能键与修饰键 | UI 测试逐个点击 F1–F12，验证实际 sendStdin 回调的完整转义字节；验证 Tab、Ctrl、Shift。桌面和真实移动组件的测试均覆盖隐藏激活 Ctrl 后清除状态，不误发命令。 |
| 3 失败、取消与窄屏 | UI 测试覆盖加载失败重试、保存失败保留草稿、保存中禁用取消、取消不保存。浏览器修复并复验长列表滚动；390×844 视口，页面 scrollWidth=390，弹窗宽 358、底部保存按钮位于视口内，F12 可滚动到达。 |
| 4 API、并发与磁盘失败 | API 测试拒绝未知、重复、缺项、非法布尔值及结构；存储测试覆盖命令/工作区字段并发保存、非法输入、磁盘失败不改文件/不广播及损坏文件拒绝覆盖。 |
| 5 自动回车与兼容 | API/存储/UI 测试覆盖新旧默认开启、关闭/重开、保存失败草稿、排序与旧客户端编辑保留设置、多行和自带末尾换行。浏览器新增命令默认勾选，取消勾选并保存、刷新后 GET 为 autoEnter=false；点击 `printf button_ok > auto-enter-proof` 后只进入真实终端输入行，临时项目中目标文件不存在，手动按终端 Enter 后文件内容为 button_ok。 |
| 6 检查与证据 | 109 项测试、完整类型、Lint 及桌面/手机尺寸浏览器验证通过；未执行生产构建。 |

## 浏览器环境与截图

- agent-browser 独立会话 `terminal-button-capabilities`，开发实例 `http://127.0.0.1:18178`。
- 数据目录 `/tmp/pmux-terminal-buttons-ysnl168r`；通过测试 preload 隔离 os.homedir，并为测试进程配置独立 tmux wrapper/socket。没有改动用户真实配置。初次测试的 tmux attach 未继承隔离 socket，修正测试环境后重新验证真实终端。
- [桌面按键设置](./desktop-settings.png)
- [手机尺寸按键设置与 F12](./mobile-settings.png)
- [手机尺寸自动回车编辑](./mobile-command-editor.png)
- [全部隐藏后恢复 F12](./mobile-restored-key.png)

## 限制

- 手机验证为 Chromium 390×844 视口模拟，非手机实机；未单独执行原生触摸事件或软键盘遮挡验证。
- 未执行完整生产构建、全仓测试和真实断网重连浏览器场景；连接刷新沿用既有同步机制，自定义命令断线禁用/不补发由回归测试覆盖。
- 按键失败与存储故障由自动化测试模拟；没有向实际磁盘注入故障。
