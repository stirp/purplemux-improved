---
page: release-metadata
title: 发布元数据
route: 'package.json、规格入口和 .github/workflows/release.yml'
status: DETAILED
complexity: Low
depends_on:
  - .specs/v20/features/fork-platform/spec.md
created: 2026-10-13
updated: 2026-10-15
assignee: ''
---

# 发布元数据

## 目标和边界

根据[需求](../../requirements/next-release.md)，在保留 v20 历史记录的前提下，将后续需求归入 v21，并准备 npm 包的下一补丁版本。
范围包括版本元数据、规格入口和发布工作流，不变更安装行为或产品界面。

## 验收标准

- `package.json` 的版本为 0.5.3，包名和唯一 CLI 入口保持一致。
- `.specs/v21/PRD.md` 与任务表指向 v21，`AGENTS.md` 的当前维护入口指向 v21。
- v20 的需求、功能规格及既有实施和验证记录仍可访问，历史版本号保持原样。
- 记录实际检查结果，区分版本准备与 npm 发布。

## 暂停 Electron 自动发布

依据需求的 2026-10-15 补充，发布流程调整为 `check → publish-npm → github-release`。

- 移除 Electron 构建任务及其 Apple 签名 Secrets 引用，保留本地 Electron 构建能力。
- GitHub Release 只依赖 npm 发布成功，移除 Electron artifact 下载及安装包、更新文件上传要求。
- npm 发布失败时不创建 GitHub Release；发布说明生成失败时仍使用 GitHub 自动生成的说明。
- 标签触发、版本校验和 npm OIDC 发布方式保持原样，不新增开关或替代签名方案。
- 验收检查工作流语法、任务依赖和产物引用；实际标签触发与远端发布结果单独记录，不由静态检查推定。

## CI 冻结安装

- `package.json` 中的 pnpm 版本和提交的锁文件必须一致，锁文件包含该版本要求的包管理器依赖元数据。
- 使用指定版本重新生成必要的锁文件内容，检查应用依赖版本与补丁不发生无关变化。
- CI 继续执行 `pnpm install --frozen-lockfile`；不得通过取消冻结检查掩盖不一致。
- 先复现安装错误，再验证修复后的冻结安装；独立记录锁文件校验、依赖安装和远端 Actions 验收结果。
