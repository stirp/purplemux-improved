# 实施与验证

## 实施

- `src/components/features/workspace/git-commit-dialog.tsx`：新增一键生成/提交/交付按钮；已有标题跳过 AI，仅填正文时保留正文；生成中可预约后续流程，共用提交及快照失效处理。
- `src/components/features/workspace/git-commit-delivery.tsx`：将实际提交文案和本次一键意图传入交付表单；身份检查失败时解除等待保护。
- `src/components/features/workspace/worktree-draft-form.tsx`：复用既有推送、草稿请求及分步确认；一键路径串行推进，记录已推送的仓库、目录、分支、HEAD 和远程，失败后仅续办剩余步骤；显示阶段进度及草稿链接/警告。
- 新按钮限制最大宽度并允许换行，沿用桌面/移动共享弹窗；11 种语言均补充新增文案。
- 不新增服务端接口、持久状态或工作流框架。复用现有校验及生成入口，保持 KISS、DRY 和职责边界；未执行本仓库 Git 提交、推送或远程 MR 创建。

## 验证过程

2026-10-22，使用当前工作树实际运行：

- 初始两组提交 UI 回归：14 项通过。
- 扩大至三组 UI 回归时，33 项通过、2 项失败；原有直接调用组件的测试手工 mock React hooks，未 mock 新使用的 `useEffectEvent`。补齐测试 mock 后复测通过。
- 首轮八组相关回归：113 项通过。随后增加等待中防重复、HEAD 变更及已有提交生成场景，交付 UI 定向回归 32 项通过；最终完整执行下列八组相关回归，116 项全部通过。
- `pnpm exec tsc --noEmit`：完整类型检查通过；最终新增测试后复查同样通过。
- 改动 TS/TSX 文件的 `pnpm exec eslint`：通过。
- `pnpm build`：Next.js 生产编译、静态页面、post-build 和 tsup 均通过；最后补充窄屏按钮最大宽度后重新完整构建，退出码 0，全部通过。
- `git diff --check`：通过。Python 检查本需求 Markdown 相对链接、`depends_on` 路径和 11 种语言新增翻译键，全部通过。

## 验收映射

| 标准 | 本次证据 |
| --- | --- |
| 1 空白、手填、仅正文 | `git-commit-delivery.test.ts` 参数化测试断言生成/提交/推送/创建顺序，提交与 PR/MR 文案一致 |
| 2 生成续办、失败停止 | 延迟生成与重复点击；生成超时、提交失败、结果未知和快照过期均不触发发布 |
| 3 保留分步、自动续办 | 原有提交/推送/草稿确认测试仍通过；分步提交自动预填文案；StrictMode 下自动路径只执行一次 |
| 4 失败恢复及目标变化 | 推送失败不创建；创建失败仅重试创建；远程与 HEAD 改变重新推送；已有草稿及关联保存警告保留 |
| 5 缺配置和忙态保护 | 缺远程、缺目标、身份不符和 dirty 阻断；补齐目标后继续；延迟推送时禁用表单和关闭，重复点击不重复请求 |
| 6 工程检查 | 类型、ESLint、相关回归与完整构建，最终结果见后续记录 |

回归命令：

```bash
pnpm exec vitest run \
  tests/unit/lib/git-commit-delivery.test.ts \
  tests/unit/lib/git-commit-dialog.test.ts \
  tests/unit/lib/git-commit-request.test.ts \
  tests/unit/lib/git-commit-api.test.ts \
  tests/unit/lib/worktree-delivery-dialog.test.ts \
  tests/unit/lib/worktree-actions-api.test.ts \
  tests/unit/lib/worktree-delivery.test.ts \
  tests/unit/lib/worktree-tools.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint \
  src/components/features/workspace/git-commit-dialog.tsx \
  src/components/features/workspace/git-commit-delivery.tsx \
  src/components/features/workspace/worktree-draft-form.tsx \
  tests/unit/lib/git-commit-delivery.test.ts \
  tests/unit/lib/worktree-delivery-dialog.test.ts
pnpm build
git diff --check
```

## 限制

- UI 交互使用 jsdom 和模拟 API；没有对真实远程执行推送或创建 PR/MR。
- 未进行浏览器视觉、物理手机或真实 AI 服务端到端验收；窄屏换行属于样式实现及构建检查，不能视为实机通过。
- 续办状态保存在当前弹窗内；关闭或刷新页面后沿用原有重新检查流程，不提供后台任务或跨重启恢复。
