---
page: release-metadata
title: 发布元数据
route: 'package.json 和规格入口'
status: DETAILED
complexity: Low
depends_on:
  - .specs/v20/features/fork-platform/spec.md
created: 2026-10-13
updated: 2026-10-13
assignee: ''
---

# 发布元数据

## 目标和边界

根据[需求](../../requirements/next-release.md)，在保留 v20 历史记录的前提下，将后续需求归入 v21，并准备 npm 包的下一补丁版本。
本次只涉及版本元数据和规格入口，不变更安装行为或产品界面。

## 验收标准

- `package.json` 的版本为 0.5.3，包名和唯一 CLI 入口保持一致。
- `.specs/v21/PRD.md` 与任务表指向 v21，`AGENTS.md` 的当前维护入口指向 v21。
- v20 的需求、功能规格及既有实施和验证记录仍可访问，历史版本号保持原样。
- 记录实际检查结果，区分版本准备与 npm 发布。
