# 验证记录

关联：[需求规格](../spec.md)、[实施记录](./build.md)、[任务进度](../task.md)。

## 2026-10-15 功能验证

以下保留原功能实施时的验证证据，未在 2026-10-16 文档拆分时重新运行应用检查。

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

## 2026-10-16 PR 审查修正验证

- 对应 [PR #42 审查意见](https://github.com/stirp/purplemux-improved/pull/42#discussion_r4285896890)：实施和验证证据分别位于 `result/build.md` 与 `result/verify.md`。
- 使用 Python 对照 `git show HEAD:.specs/v22/changes/codex-dollar-skills/result.md` 检查原实施段、验证表、命令结果及限制说明均完整保留，并检查本需求 Markdown 相对链接和 `depends_on` 路径：通过。
- 使用 `rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**' --glob '!dist/**' 'codex-dollar-skills/result\.md|\]\(\./result\.md\)' .` 搜索旧路径引用：本需求旧文档链接无残留；验证命令中保留旧路径用于追溯原证据，其他需求的独立 `result.md` 链接不受本次调整影响。
- `git diff --check`：通过。
- 本次仅调整需求证据文档，按仓库纯文档变更规则检查内容、路径、链接和差异格式；未重新运行应用测试、TypeScript、ESLint、生产构建或浏览器验收。
