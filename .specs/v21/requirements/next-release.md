# 下一版版本准备

用户确认 0.5.2 已发布，要求提升包版本，并将后续需求维护入口推进到 v21。

## 范围与验收

- 使用 `npm version patch --no-git-tag-version` 将包版本提升为 0.5.3，不创建提交或标签。
- 包名、命令入口、依赖及构建脚本保持原样。
- 保留 `.specs/v20/` 的历史规格；在 `.specs/v21/` 新建后续需求入口，并更新仓库指引。
- 校验包版本、规格引用和改动文件；构建、发布及安装验收如未执行须明确记录。

## 暂停 Electron 自动发布（2026-10-15）

用户暂无 Apple 签名能力，要求先关闭 GitHub Actions 中的 Electron 应用构建。

- 标签发布只执行检查、npm 发布和 GitHub Release 创建，不启动 macOS Electron 构建或读取 Apple 签名 Secrets。
- GitHub Release 在 npm 发布成功后生成发布说明，不依赖或上传 Electron 安装包和更新文件。
- 保留本地 Electron 源码、构建脚本与配置，恢复自动发布时另行调整 workflow。
- 保留现有标签触发、版本一致性检查、npm OIDC 认证和发布说明生成失败后的回退行为。

## 修复 CI 冻结安装（2026-10-15）

用户反馈 `pnpm install --frozen-lockfile` 因锁文件缺少最新 `packageManagerDependencies` 而失败。

- 使用项目指定的 pnpm 版本补齐安装所需的锁文件元数据，保留 CI 的冻结安装约束。
- 不主动升级应用依赖或切换包管理器版本；核对生成结果中的依赖版本与补丁配置。
- 验证修复后冻结安装通过，记录实际使用的工具版本、命令及运行限制。
