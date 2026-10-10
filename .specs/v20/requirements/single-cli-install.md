# 安装后仅保留一个 CLI 命令

用户反馈：Linux 打包安装后出现 purplemux 和 purplemux-improved，预期只有 purplemux-improved。

## 范围与验收

- package.json 和打包后的包元数据仅声明 purplemux-improved 一个 bin 入口，取消 purplemux、pmux 别名。
- 继续使用 bin/purplemux.js 实现，保持 ~/.purplemux 数据和 CLI 功能兼容。
- 同步安装说明和 [fork-platform 规格](../features/fork-platform/spec.md)。
- CLI 帮助、Claude/Codex 工作区提示及多语言安装和 CLI 文档同步使用唯一命令。
- 不修改 Electron 打包配置，不自动删除独立上游包或用户自行创建的旧命令。
- 校验实际包元数据、现有 CLI 回归和完整 TypeScript；全局安装实机检查若未执行须明确记录。
