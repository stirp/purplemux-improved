# 实施与验证

## 实施

- 根因：Node 启动包装器可能让 tmux 的 `currentProcess` 显示为 `node`。移动端菜单只看缓存的 Agent 身份和运行标记，没有桌面端已有的打开前实时检查；Terminal 状态广播不提供 Agent 身份，缓存缺失时就显示启动菜单。
- `src/lib/agent-check.ts`：将桌面端已有请求提取为 `refreshDetectedAgent`，仍使用 `/api/check-agent` 和 `applyAgentCheckResult`，增加无会话名时直接返回的边界。
- `src/components/features/mobile/mobile-tab-header.tsx`：点击模式按钮先完成实时检测，再打开菜单，识别到运行中的 Claude/Codex 后使用已有 Chat 视图切换路径。
- `src/components/features/workspace/agent-mode-switcher.tsx`：复用共用请求，保留原菜单行为。
- `docs/STATUS.md`：记录视图菜单的实时检测路径及失败回退。
- KISS/DRY：复用现有检测端点、状态更新时间戳和切换回调，仅抽出重复请求；不新增轮询、存储字段或进程扫描算法。

## 验证

本工作树最初没有依赖，通过本地 `node_modules` 符号链接复用 `/home/home/workspace/purplemux/node_modules`；未安装或更新依赖。为避免 Turbopack 不支持项目外依赖链接的问题，构建使用 webpack。

| 验收项 | 本次检查 | 结果 |
| --- | --- | --- |
| 1、2、3、4、5 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/agent-mode-detection.test.ts tests/unit/lib/claude-session-detection.test.ts tests/unit/lib/tab-store-session-view.test.ts` | 3 文件、29 项通过；新加 10 项，包括真实 React 菜单点击、未知缓存恢复、Codex、无会话 ID、确认退出、网络/HTTP 失败、无 tmux 名称、旧响应保护及桌面回归 |
| 5 | `node node_modules/typescript/bin/tsc --noEmit` | 通过；首轮发现新增测试缺少 workspaceId，已修复后重跑通过 |
| 5 | `node node_modules/eslint/bin/eslint.js src/lib/agent-check.ts src/components/features/mobile/mobile-tab-header.tsx src/components/features/workspace/agent-mode-switcher.tsx tests/unit/lib/agent-mode-detection.test.ts` | 通过 |
| 5 | `node node_modules/next/dist/bin/next build --webpack` | 类型检查、webpack 编译通过（110 秒）；收集 `/login` 页面数据时因 `ReferenceError: self is not defined` 失败，完整构建未通过 |
| 规格一致性 | 检查 depends_on、需求内 Markdown 链接与 `git diff --check` | 路径均存在，差异格式通过 |

## 验收限制

- 组件交互运行于 jsdom，实时检测响应使用 mock；不是浏览器或 iPhone 实机验收。
- 构建失败与历史记录 `.specs/v20/result/verify-mobile-empty-workspace-selection.md` 中的症状相同；未将历史结果当成本次通过证据，也未扩展修复登录页构建。
- 未操作用户正在运行的 Claude 会话，也未发布或重启服务。
