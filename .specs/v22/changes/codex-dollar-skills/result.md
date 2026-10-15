# 实施与验证记录

## 实施

2026-10-15：先完成本需求规格，再实现代码。

- `src/lib/native-command-completion.ts`：统一按 provider 识别单行原生菜单输入，Codex 接受 `/` 和 `$`，Claude 仅接受 `/`；完成检测复用同一规则，避免技能前缀及未提交草稿导致提前恢复焦点。
- `src/hooks/use-native-commands.ts`：复用上述判定，沿用原有终端展开、发送、焦点管理、作用域和手动返回流程。
- `src/components/features/workspace/web-input-bar.tsx`：空输入框单字符自动触发及单行草稿手动入口采用共享判定，桌面和移动端共同生效。
- 遵循 KISS/DRY：仅扩展现有通道的输入判定，不新增技能查询 API、Web 列表、状态模型或依赖。
- 已阅读 Next.js 16.2.6 随包 Pages Router 表单及 Vitest 指引；本次不涉及路由或服务端表单行为。

## 验证

工作区初始未安装依赖；执行 `pnpm install --frozen-lockfile` 成功，package.json 和锁文件未变更。

| 验收项 | 本次证据 | 结果 |
| --- | --- | --- |
| `$` 自动转交、不追加 Enter、清空 Web 草稿 | `native-command-input.test.ts` 组合真实 WebInputBar、useWebInput 和 useNativeCommands，以 DOM InputEvent 驱动；断言发送次数、终端展开、焦点调用和输入禁用 | 通过 |
| 桌面与移动端 | 同一集成测试分别模拟桌面和移动设备标志；源码检查两端均复用该输入框和 Hook | 自动化通过，非实机验收 |
| `/` 兼容、技能前缀手动入口及普通文本边界 | `native-command-input.test.ts`、`native-command-completion.test.ts` 覆盖两个 provider、单行技能前缀、前导空白、正文和多行 | 通过 |
| 队列、附件、断连、needs-input、unknown、inactive 及输入法组合 | DOM 输入集成测试断言不发送且保留草稿 | 通过 |
| 未提交技能草稿与取消恢复 | `native-command-completion.test.ts` 使用模拟终端屏幕和定时器；集成测试验证手动返回发送 Ctrl-E/Ctrl-U、取消延迟终端聚焦并恢复 Web 焦点 | 通过 |

检查命令与结果：

- `pnpm exec vitest run tests/unit/lib/native-command-completion.test.ts tests/unit/lib/native-command-input.test.ts tests/unit/lib/codex-tui-ready-detector.test.ts`：49 项通过，0 失败。
- `pnpm exec tsc --noEmit`：完整检查通过。
- `pnpm exec eslint src/lib/native-command-completion.ts src/hooks/use-native-commands.ts src/components/features/workspace/web-input-bar.tsx tests/unit/lib/native-command-completion.test.ts tests/unit/lib/native-command-input.test.ts`：通过，无错误或警告。首次检查遇到测试 Harness 中 createElement 传递 useRef 被 refs 规则误判，改用每项测试独立的稳定回调容器后重跑通过，测试亦重跑通过。
- `pnpm build`：通过，包含 Next.js 类型检查、生产编译、静态页生成、post-build 及 tsup 服务端打包。
- `git diff --check`：通过；本需求 Markdown 链接及 depends_on 路径检查通过。

## 限制

未运行真实浏览器、移动设备或 Codex TUI 联调。自动化覆盖输入交接和模拟屏幕完成检测；真实技能列表及其展示由当前 Codex 版本、会话和技能安装状态决定，不能据此声称实机验收通过。
