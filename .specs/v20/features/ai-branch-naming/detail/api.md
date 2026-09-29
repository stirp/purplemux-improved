# AI 分支名生成与分支快速筛选：接口与数据

## 接口或内部通道

- POST /api/workspace/generate-branch-name：验证输入后以 textOnly 模式调用文本生成器。
- 配置通过 /api/config 及 config store 保存。

## 数据与执行边界

- 当前 Codex CLI 无法保证无工具文本生成；选择 Codex 时接口返回 409 codexTextOnlyUnavailable，需使用 Claude Code。
- 生成名称不等于创建分支；实际创建仍由 Worktree 流程验证。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
