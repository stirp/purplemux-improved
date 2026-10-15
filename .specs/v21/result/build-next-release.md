# 下一版版本准备实施记录

## 2026-10-15 CI 冻结安装修复

- 标签 `v0.5.3` 已推送到 `156deb10`；Actions 运行 `38664915587` 的 check 在 `pnpm install --frozen-lockfile` 失败，提示缺少 `packageManagerDependencies`。
- 工作区使用 pnpm 12.11.2 补齐 `pnpm-lock.yaml` 的包管理器依赖记录，应用依赖声明、覆盖与补丁未改动。
- 此修复需要独立提交；此前的 `v0.5.3` 标签提交不会自动包含锁文件改动。

日期：2026-10-13。依据：[需求](../requirements/next-release.md)、[规格](../features/release-metadata/spec.md)。

- 执行 `npm version patch --no-git-tag-version`，将 package.json 版本由 0.5.2 提升到 0.5.3；未创建 Git 提交或标签。
- 恢复 npm 命令带来的无关 browserslist 排版变化，保留原有包名、依赖、脚本和 CLI 入口。
- 新建 v21 需求、功能规格、PRD 和任务表；更新 AGENTS.md 的当前规格入口。
- 保留 v20 原有目录及历史记录，历史文档中的 0.5.2 仍指向当时的版本。

## 暂停 Electron 自动发布（2026-10-15）

- 先补充需求及发布规格，再调整 `.github/workflows/release.yml`。
- 移除 `build-electron` 任务，包括 macOS 构建、Apple 签名 Secrets 和 artifact 上传。
- `github-release` 改为仅依赖 `publish-npm`，移除 Electron artifact 下载、安装包与更新文件上传要求。
- 保留检查、标签与版本校验、npm OIDC 发布及发布说明生成/回退逻辑。
- 遵循 KISS/YAGNI，直接精简工作流，不增加发布开关或替代签名方案；本地 Electron 源码、脚本和配置保持可用。
- 本次未提交、推送或触发远端发布。检查结果见[验证记录](./verify-next-release.md)。
