---
page: release-v0-5-4
title: 通过 GitHub Tag 发布 v0.5.4
status: DETAILED
created: 2026-10-16
updated: 2026-10-16
depends_on:
  - ../../../v21/features/release-metadata/spec.md
  - ../spec-version-advance/spec.md
  - ../compact-workspace-sidebar/spec.md
---

# 通过 GitHub Tag 发布 v0.5.4

## 用户需求与范围

用户要求：“按照规范，通过 github tag 发布 v0.5.4 版本”。
基于已合并的 main 准备版本元数据、提交并推送发布 Tag，跟踪现有 GitHub Actions 的真实发布结果。

## 行为约定

- 本需求将发布元数据基线的包版本目标由 0.5.3 替代为 0.5.4；规格维护入口继续为 v22。
- 使用 `npm version 0.5.4 --no-git-tag-version` 更新包版本，验证后提交并创建 `v0.5.4` 附注标签。标签必须指向包含该版本元数据的发布提交。
- 沿用 `.github/workflows/release.yml` 的 `check → publish-npm → github-release` 流程；冻结安装、检查、npm OIDC、发布说明回退及暂停 Electron 自动发布的约定保持不变。
- 发布前修复工作区菜单回归测试的 React mock：紧凑侧栏新增 `useId` 后，直接调用组件的既有测试必须提供该 hook 的稳定替身，继续验证桌面与移动菜单顺序及子工作区限制；不改变产品行为或放宽断言。
- 不修改产品功能、依赖或历史规格；不覆盖已有远端标签、不强制推送。
- 分别记录本地检查、标签推送、Actions、npm registry 和 GitHub Release 的实际结果；远端未完成时不得宣称发布成功。

## 验收标准

1. 包版本为 0.5.4，包名和 CLI 入口不变，依赖与锁文件无无关变动。
2. 发布前完整 ESLint、TypeScript、单元及 CLI 测试通过；远端冻结安装和生产构建通过。
3. GitHub 的 `v0.5.4` 标签与发布提交一致，Release 工作流成功。
4. 官方 npm registry 可查询 `purplemux-improved@0.5.4`，GitHub Release 已公开且指向 `v0.5.4`。
5. 本目录记录实施、检查命令、发布链接及未执行项目；本次不将浏览器或安装实机验收推定为已通过。

见[任务](./task.md)与[实施及验证记录](./result.md)。
