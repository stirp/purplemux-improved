# AI 提交信息生成超时：实施记录

日期：2026-10-05。先更新[规格](../features/ai-git-writing/spec.md)、流程、接口与[需求](../requirements/ai-git-generation-timeout.md)，再实施。

- `src/lib/git-commit-request.ts` 统一请求：150 秒有限等待、408/504 分类、非 JSON 兼容、调用者取消及计时器清理；不自动重试。
- 提交弹窗仅在生成成功时更新草稿与快照。提交结果不确定时禁用原预览，提示检查 Git 后重新打开。
- `AgentTextTimeoutError` 统一 Claude CLI 与登录 shell 超时，生成接口返回 504 / `generateTimeout`。
- 11 种语言添加超时、请求失败与提交结果不确定提示。

沿用同步 API，未增加后台任务系统或修改代理配置。KISS：独立请求函数集中处理错误；DRY：三个 action 共用处理；保留现有快照校验和私有索引，生成失败不执行提交。

未提交或推送。检查证据见[验证记录](./verify-ai-git-generation-timeout.md)。
