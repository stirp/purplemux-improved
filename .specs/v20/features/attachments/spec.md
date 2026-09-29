---
page: attachments
title: 附件草稿与上传访问保护
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-09-28
assignee: ''
---

# 附件草稿与上传访问保护

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 改善 Web 输入附件草稿处理及上传客户端错误处理。
- 附件随输入内容关联，配合排队消息发送。
- 上传文件读取路径补充认证与代理路径检查。

## 边界与约束

- 未认证访问不能绕过上传文件保护。
- 上传失败不能误标记为附件已可用，路径需遵循服务端允许范围。

## 验收标准

- 附件草稿提交后与对应消息匹配。
- 未认证读取被拒绝，编码路径不能绕过保护。

## 实现依据

- [src/lib/attachment-draft.ts](../../../../src/lib/attachment-draft.ts)
- [src/lib/upload-image-client.ts](../../../../src/lib/upload-image-client.ts)
- [src/pages/api/upload-image.ts](../../../../src/pages/api/upload-image.ts)
- [src/pages/api/uploads/[...path].ts](../../../../src/pages/api/uploads/[...path].ts)
- [src/proxy.ts](../../../../src/proxy.ts)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/lib/attachment-draft.test.ts](../../../../tests/unit/lib/attachment-draft.test.ts)
- [tests/unit/api/uploads-auth.test.ts](../../../../tests/unit/api/uploads-auth.test.ts)
- [tests/unit/lib/uploads-proxy.test.ts](../../../../tests/unit/lib/uploads-proxy.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`58cd8488`, `99a361a2` | DETAILED |
