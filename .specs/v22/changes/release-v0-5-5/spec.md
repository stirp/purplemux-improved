---
page: release-v0-5-5
title: 通过 GitHub Tag 发布 v0.5.5
status: DETAILED
created: 2026-10-17
updated: 2026-10-17
depends_on:
  - ../../../v21/features/release-metadata/spec.md
  - ../release-v0-5-4/spec.md
  - ../spec-version-advance/spec.md
  - ../pmuxi-cli-only/spec.md
  - ../pmuxi-cli-skill/spec.md
---

# 通过 GitHub Tag 发布 v0.5.5

## 用户需求与范围

用户要求：“双手发布 0.5.5 吧”。延续上一版本的 GitHub Tag 发布流程，发布当前已合并的 main，跟踪 npm 与 GitHub Release 的实际结果。

## 行为约定

- 发布版本目标由 0.5.4 更新为 0.5.5，规格维护入口继续为 v22。
- 使用 `npm version 0.5.5 --no-git-tag-version` 更新版本；检查后创建发布提交和 `v0.5.5` 附注标签，同时推送 main 与标签。
- 沿用 `check → publish-npm → github-release`，保留冻结安装、Node 24、npm OIDC/provenance、发布说明回退和暂停 Electron 自动发布的约定。
- CLI 入口按 pmuxi 增量规格保留 `purplemux-improved` 与 `pmuxi`，覆盖旧发布基线的唯一 CLI 条款；实际发布包须包含 `bin/skills/pmuxi/SKILL.md`。
- 不新增产品功能、不升级依赖、不覆盖远端标签、不强制推送。必要的发布阻断修正须先补充规格并记录原因。
- 单独记录本地检查、远端 Actions、registry 可用性与 tarball 完整性，不把 npm 接收请求等同于公开可用。

## 验收标准

1. 包版本为 0.5.5，包名、两个命令入口及现有依赖保持一致。
2. 本地完整 ESLint、TypeScript、单元及 CLI 测试通过；远端 Node 24 下冻结安装、全部检查和生产构建通过。
3. GitHub Tag 指向发布提交，Release 工作流成功，v0.5.5 Release 公开且非预发布。
4. 官方 registry 存在 0.5.5，latest 与 gitHead 正确；tarball 可下载且 SHA-512 匹配，包含版本元数据、两个入口、Skill、LICENSE、服务器及 standalone 产物。
5. 发布包中的 `pmuxi skill` 可离线读取随包 Skill；本次未执行的浏览器或完整安装实机验收明确记录。

见[任务](./task.md)与[实施及验证记录](./result.md)。
