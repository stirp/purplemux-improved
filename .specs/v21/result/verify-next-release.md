# 下一版版本准备验证记录

## 2026-10-15 CI 冻结安装检查

| 检查 | 本次结果 |
| --- | --- |
| GitHub Actions `38664915587` | check 的冻结安装失败，publish-npm 跳过；官方 npm latest 仍为 0.5.2 |
| `pnpm --version` | 12.11.2，与 package.json 一致 |
| `pnpm install --frozen-lockfile --lockfile-only`、`pnpm install --frozen-lockfile` | 补齐锁文件后均通过 |
| `pnpm tsc --noEmit`、`git diff --check` | 通过 |
| 锁文件差异 | 新增 pnpm 12.11.2 的 packageManagerDependencies 与对应平台快照；现有应用依赖版本和补丁配置保持原样 |

未在新提交上触发 Actions；远端发布仍未通过。

日期：2026-10-13。依据：[需求](../requirements/next-release.md)、[规格](../features/release-metadata/spec.md)。

| 检查 | 本次结果 |
| --- | --- |
| `npm version patch --no-git-tag-version` | 成功输出 v0.5.3 |
| `node -p` 读取 package.json | 版本 0.5.3、包名 purplemux-improved、唯一 bin 为 purplemux-improved |
| `pnpm install --frozen-lockfile --lockfile-only` | 通过；锁文件无需变更 |
| v21 Markdown 相对链接检查 | 通过 |
| `git diff --check` | 通过 |

本次只准备版本元数据和新规格入口；未运行构建、打包、安装验收，也未发布 npm 包。

## 暂停 Electron 自动发布（2026-10-15）

依据：[需求补充](../requirements/next-release.md)、[发布规格](../features/release-metadata/spec.md)。

| 检查 | 本次结果 |
| --- | --- |
| `node /tmp/purplemux-verify-release.cjs` | 通过；使用现有 js-yaml 解析 YAML，与 HEAD 工作流比较：仅保留 check、publish-npm、github-release 三个任务，依赖有效，无 Electron/签名/artifact 引用；检查、npm、触发方式及发布说明回退逻辑一致 |
| `pnpm tsc --noEmit` | 通过，无类型错误 |
| `rtk proxy pnpm exec eslint .github/workflows/release.yml`（另直接运行本地 ESLint 复核） | 退出码 0，提示没有匹配 YAML 的配置而忽略文件；不能视为 ESLint 验证通过，YAML 使用上面的结构校验 |
| `git diff --check` | 通过 |

首次结构校验因沙箱内 Node 调用 Git 报 EPERM 未完成；获准在沙箱外运行只读校验后通过。当前环境未安装 actionlint，结构检查不替代 GitHub 服务端验收。

pnpm 执行 ESLint 首次因临时包管理器目录只读而失败；获准在沙箱外重跑后得到上表结果。

本次只修改发布 YAML 和规格文档，未新增自动化测试文件，未执行产品构建、浏览器检查、Git 提交、标签推送或实际 npm/GitHub 发布。
