# 下一版版本准备验证记录

日期：2026-10-13。依据：[需求](../requirements/next-release.md)、[规格](../features/release-metadata/spec.md)。

| 检查 | 本次结果 |
| --- | --- |
| `npm version patch --no-git-tag-version` | 成功输出 v0.5.3 |
| `node -p` 读取 package.json | 版本 0.5.3、包名 purplemux-improved、唯一 bin 为 purplemux-improved |
| `pnpm install --frozen-lockfile --lockfile-only` | 通过；锁文件无需变更 |
| v21 Markdown 相对链接检查 | 通过 |
| `git diff --check` | 通过 |

本次只准备版本元数据和新规格入口；未运行构建、打包、安装验收，也未发布 npm 包。
