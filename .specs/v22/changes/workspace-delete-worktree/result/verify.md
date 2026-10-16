# 验证记录

## 本次自动化检查

- `pnpm install --frozen-lockfile`：成功，准备本 worktree 的本地依赖，未修改依赖声明及锁文件。
- `pnpm exec vitest run tests/unit/lib/delete-workspace-dialog.test.ts tests/unit/lib/worktree-manager.test.ts tests/unit/lib/worktrees-api.test.ts tests/unit/lib/workspace-delete.test.ts tests/unit/lib/workspace-menu-order.test.ts tests/unit/lib/workspace-touch-menu.test.ts`：92 项通过，0 失败。
- `pnpm exec eslint src/components/features/workspace/delete-workspace-dialog.tsx src/components/features/mobile/mobile-workspace-actions.tsx src/components/layout/sidebar.tsx tests/unit/lib/delete-workspace-dialog.test.ts`：通过。
- `pnpm exec tsc --noEmit`：首次发现新增测试中 `onClose` mock 的类型过宽，已改为明确的 `() => void`；完整复跑通过，0 错误。
- 修正测试类型后执行 `pnpm exec vitest run tests/unit/lib/delete-workspace-dialog.test.ts` 与该文件 ESLint：22 项通过，ESLint 通过。
- `pnpm build`：通过；Next.js 类型检查、Turbopack 优化编译、24 个静态页面生成、post-build 和 tsup 自定义服务端构建均成功，退出码 0。
- `git diff --check`：通过；脚本校验本需求四份规格/记录文档的相对链接和依赖路径，以及 11 种语言新增键与 ICU 占位符：通过。

## 验收映射

| 验收 | 本次证据 |
| --- | --- |
| 1 默认只删除项目、取消与共享入口 | 组件用例验证默认不勾选、普通删除回调与移动默认流程、取消无 mutation；源码核对桌面与移动均使用共享组件 |
| 2 目标识别与兼容 | 无 worktree 元数据的项目可识别；普通目录、主工作树、同仓库其他项目、多目标、加载失败和部分查询失败均不误选 |
| 3 安全删除参数与结果 | 组件断言确认目标的仓库、目录、HEAD、分支、固定保留分支和关闭空闲会话参数；既有 store 根据返回项目 ID 更新列表；真实临时 Git 仓库回归确认删除工作树并保留分支 |
| 4 文件确认与安全保护 | 忽略文件清单及勾选门槛、七类前端 blocker、服务端 sessions/changed/ignored 拒绝无普通删除降级；既有 manager/API 回归覆盖真实文件与会话复核 |
| 5 重试与操作状态 | 刷新/重开重置选择、失败后刷新重试、部分清理失败告警、重复提交与关闭保护 |
| 6 工程检查 | 见上方本次命令结果 |

## 限制

- 组件交互使用 jsdom，弹窗外壳与 store 经过 mock；未进行浏览器端到端或手机实机验收，不能视为完整 UI 运行验收。
- Git 删除回归只操作测试创建的临时仓库，没有删除用户现有项目、worktree 或会话。
- 未执行 Git 提交、推送或发布。
