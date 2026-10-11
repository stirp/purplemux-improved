# CLI 单命令安装实施记录

日期：2026-10-10。

依据：[需求](../requirements/single-cli-install.md)、[fork-platform](../features/fork-platform/spec.md)。先更新规格，再修改安装入口。

## 根因与修改

package.json 的 bin 将同一脚本注册为 purplemux-improved、purplemux、pmux 三个命令；这会生成多个命令入口，并非安装了多个 Electron 应用。

- package.json 仅保留 purplemux-improved → ./bin/purplemux.js。
- bin/cli.js 与 bin/feature-commands.js 的帮助示例改用唯一命令。
- src/lib/claude-prompt.ts 与 src/lib/providers/codex/prompt.ts 更新工作区提示，避免 Agent 调用已取消的别名。
- README、README.zh-CN 和 landing-src/docs 下各语言 installation/cli-reference 文档取消别名说明，更新命令示例。

复用现有入口与数据目录，不重命名实现脚本、不新增兼容包装器或依赖，保持 KISS/DRY/YAGNI。

不修改版本、不执行提交、推送、发布或全局包管理；不自动删除外部旧包。
