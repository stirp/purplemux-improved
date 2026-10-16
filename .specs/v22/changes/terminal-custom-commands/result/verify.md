# 验证记录

日期：2026-10-16。以下均为本次实际运行结果。

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/api/terminal-commands.test.ts tests/unit/lib/terminal-commands-storage.test.ts tests/unit/lib/session-workflow-storage.test.ts tests/unit/lib/workspace-reorder.test.ts` | 48 项通过 |
| `pnpm exec vitest run tests/unit/lib/terminal-commands-ui.test.ts` | 4 项通过；修正测试缓存类型后重跑仍通过 |
| `pnpm exec tsc --noEmit` | 最终通过；新增 UI 测试曾使用 `Map<string, unknown>` 不符合 SWR 缓存类型，改为 `Cache` 后完整重跑通过 |
| 改动的 9 个源码文件及 3 个测试文件执行 `pnpm exec eslint` | 通过；测试类型修正后该文件另行复查通过 |
| `pnpm install --frozen-lockfile` | 通过；新增表单依赖，既有依赖解析保持不变 |
| `git diff --check` | 通过；已修正锁文件末尾多余空行 |

源码检查范围：`src/lib/terminal-custom-commands.ts`、`src/lib/workspace-store.ts`、`src/hooks/use-terminal-commands.ts`、`src/hooks/use-sync.ts`、`src/types/terminal.ts`、`src/pages/api/terminal-commands.ts`、`src/components/features/workspace/terminal-commands-bar.tsx`、`src/components/features/workspace/pane-container.tsx`、`src/components/features/mobile/mobile-surface-view.tsx`。

## 验收映射

| 规格条款 | 证据 | 结果 |
| --- | --- | --- |
| 1 新增、自定义名称、持久化 | API/存储/UI 测试；浏览器新增中文名称，刷新后保留；直接读取隔离实例的 workspaces.json，四条命令及工作区数据均存在 | 通过 |
| 2 编辑、取消、删除确认 | UI 测试覆盖取消不写入；浏览器把“打印验收标记”改成“我的常用命令”，确认删除后列表消失 | 通过 |
| 3 校验与异常请求 | API 测试覆盖空白、长度、ESC 控制字符、缺失 ID、错误方法与 404/409/500；UI 测试覆盖空字段提示 | 通过 |
| 4 当前终端执行、断线与重连 | UI 测试切换发送回调、断线禁用与重连不补发；输入测试覆盖多行 CRLF/LF 和不重复 Enter；桌面、移动模拟均点击按钮并在真实 fish 终端观察到 CUSTOM_COMMAND_OK | 通过 |
| 5 失败保留草稿、读取重试 | UI 测试模拟保存失败并重试，草稿仍存在；读取失败显示错误并可恢复；存储测试覆盖写失败及不可读/损坏文件不覆盖 | 通过 |
| 6 桌面入口、移动布局 | 1280px 桌面默认虚拟按键栏隐藏时仍显示命令栏；iPhone 12 模拟 390px，页面 scrollWidth=390；编辑弹窗 left=16/right=374；四条长名称列表 clientWidth=330/scrollWidth=792，scrollLeft 可达 462 | 通过 |
| 7 并发与兼容 | 存储测试覆盖并发新增五条、50 条上限、旧文件默认空列表、工作区其他设置更新仍保留命令 | 通过 |

## 浏览器环境与截图

- 使用 agent-browser 独立会话 `terminal-custom-commands`，Next 开发实例 `http://127.0.0.1:18167`。
- 数据目录与 tmux socket 均隔离在 `/tmp/pmux-custom-commands-mjypepae`。临时 preload 重定向 `os.homedir()`，并为 PTY 附着保留隔离的 tmux 路径；未修改用户真实配置。
- 初始测试数据缺少既有 `sessionWorkflow` 导致首页 SSR 报 undefined 序列化错误，调用既有工作区 GET 完成初始化后继续。测试实例重启后新增标签接口曾返回 404，随后通过既有 `addTabToPane` 工具建立测试终端；这些准备问题未改动本需求源码。
- [桌面执行结果](./desktop.png)、[移动端命令栏与执行结果](./mobile.png)、[移动端编辑弹窗](./mobile-editor.png)。

## 范围与限制

- 已完成规格、实现、自动化检查和 Chromium 桌面/手机尺寸浏览器验收。
- 未执行生产构建；本次采用真实开发实例浏览器验证。未进行手机实机及软键盘验收。
- 其他八种语言的新文案暂使用英文；简体中文、繁体中文与英文提供对应文案。
- 浏览器与测试服务器完成验收后关闭；未提交、推送或发布。

## Review 修正验证：copy-mode 下执行命令

以下为修正后的本轮运行结果，上文 52 项测试及截图保留为初次实现证据。

- `pnpm exec vitest run tests/unit/lib/terminal-websocket-flow.test.ts tests/unit/lib/terminal-backpressure.test.ts tests/unit/lib/terminal-commands-ui.test.ts`：25 项通过。新增客户端测试确认自定义命令使用网页输入帧并且断线不补发；新增服务端测试延迟完成 `exitCopyMode`，确认等待期间不写 PTY，完成后按顺序写入 `pwd\r`、`ls\r`。
- `pnpm exec tsc --noEmit`：完整类型检查通过。
- `pnpm exec eslint src/components/features/workspace/pane-container.tsx src/components/features/mobile/mobile-surface-view.tsx tests/unit/lib/terminal-websocket-flow.test.ts tests/unit/lib/terminal-backpressure.test.ts`：通过。
- `git diff --check`：通过。
- 浏览器继续使用上文隔离数据目录与 tmux socket，独立 agent-browser 会话为 `terminal-custom-commands-copy-mode`；既有终端工具创建测试终端并输出 150 行历史，再在实际 xterm 屏幕触发向上滚轮事件。

| 场景 | 点击前 | 点击后的传输与终端结果 |
| --- | --- | --- |
| 桌面 | 终端显示 tmux copy-mode 标记 `[0/132]` | 按钮实际发送 `{type: 5, text: "echo COPY_MODE_OK\r"}`；历史标记消失，shell 输出 `COPY_MODE_OK` |
| iPhone 12 模拟，390px | 移动端终端显示 `[0/128]`，横向滚动命令栏使按钮可见 | 按钮实际发送同一网页输入帧；历史标记消失，shell 新增一条 `COPY_MODE_OK` 输出并返回提示符 |

本轮完成桌面/手机尺寸的真实浏览器与 tmux 验收；未执行生产构建及手机实机测试。测试实例和浏览器在验证后关闭。
