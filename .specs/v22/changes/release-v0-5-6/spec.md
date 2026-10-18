---
page: release-v0-5-6
title: 通过 GitHub Tag 发布 v0.5.6
status: DETAILED
created: 2026-10-19
updated: 2026-10-19
depends_on:
  - ../release-v0-5-5/spec.md
  - ../ai-generated-file-web-access/spec.md
---

# 通过 GitHub Tag 发布 v0.5.6

## 用户需求与范围

用户要求：“继续发布新版吧”。当前版本为 0.5.5，延续此前 GitHub Tag 发布方式，将已合并的 main 发布为下一个补丁版本 0.5.6。

## 行为约定

- 将发布目标由 0.5.5 替代为 0.5.6，使用 `npm version 0.5.6 --no-git-tag-version`，检查后创建发布提交及 `v0.5.6` 附注标签，原子推送 main 与标签。
- 沿用 `check → publish-npm → github-release`、Node 24、冻结安装、npm OIDC/provenance、发布说明回退和暂停 Electron 自动发布约定。
- 保留 `purplemux-improved` 与 `pmuxi` 两个入口及随包 Skill；发布包须包含网页文件访问已有规格要求的 Koffi 运行依赖与 macOS 预编译文件。
- 不新增产品功能或升级依赖，不覆盖远端标签、不强制推送；发布阻断问题先补充约定再修正。
- 记录本地检查、远端构建和发布、registry 可用性及包内容验证；收到 npm HTTP 202 不能代替公开可用性确认。

## 验收标准

1. 版本为 0.5.6，包名、两个 bin、依赖与锁文件不发生本次发布之外的变化。
2. 完整 ESLint、TypeScript、单元及 CLI 测试通过；远端 Node 24 的冻结安装、检查及生产构建通过。
3. 远端 Tag 对应发布提交，Actions 成功，GitHub Release 公开且非预发布。
4. npm registry 的 0.5.6、latest、gitHead 一致；发布 tarball 可下载、SHA-512 正确，含 LICENSE、CLI、Skill、服务器及 standalone 产物。
5. 解包后 pmuxi 帮助及 skill 离线读取通过；standalone 包含 Koffi 及 macOS arm64/x64 原生文件。仅检查归档内容不表示通过 macOS 实机运行验收。
6. 规格、任务和结果记录完整；不将未执行的浏览器、完整安装及 macOS 实机验收记为通过。

见[任务](./task.md)和[实施与验证记录](./result.md)。
