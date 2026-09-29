# Worktree 检索、空间统计与批量清理：接口与数据

## 接口或内部通道

- POST /api/workspace/worktree-actions：measure、previewCleanup、cleanup。
- 批量 items 为 1 至 50 项且工作树身份不得重复；快照包含 repositoryId、directory、head、branch。

## 数据与执行边界

- 未知打开时间不能被推断为空闲。
- 测量不跟随符号链接，不把共享 Git 数据重复计入目录占用。
- 保护承载当前管理界面的工作区；预览后新增文件或 HEAD 变化需重新确认。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
