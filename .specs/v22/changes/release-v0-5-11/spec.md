---
page: release-v0-5-11
title: 通过 GitHub Tag 发布 v0.5.11
status: DETAILED
created: 2026-10-29
updated: 2026-10-29
depends_on:
  - ../release-v0-5-10/spec.md
---

# 通过 GitHub Tag 发布 v0.5.11

## 用户需求与范围

用户要求“发布新版本吧”。当前包与 npm latest 均为 0.5.10，将已合并的 main 发布为补丁版本 0.5.11，包含 Codex 草稿与重复消息、信任提示卡住 Chat、闲置 Agent 页签回收修复。

## 行为约定

- 版本目标从 0.5.10 更新为 0.5.11；使用 `npm version 0.5.11 --no-git-tag-version`，检查通过后提交、创建附注标签并原子推送 main 与 v0.5.11。
- 沿用 Node 24、冻结安装、`check → publish-npm → github-release`、npm OIDC/provenance、发布说明回退和暂停 Electron 自动发布约定。
- 保留 Node >=24、两个 CLI、随包 Skill、Koffi 布局及桌面更新依赖分类。本次只准备版本元数据和发布证据，不新增产品逻辑或升级依赖。
- 本地静态检查与测试分阶段执行，Vitest 使用单 worker，保持测试断言和超时；远端工作流不变。
- 不覆盖已发布版本、不移动已发布标签或强制推送。发布阻断问题先补充约定，再按实际问题修正。
- 分别核验 npm 接收请求、公开元数据和正式包下载，不将 HTTP 202 当作安装可用证据。

## 验收标准

1. package.json 仅版本更新为 0.5.11；依赖和锁文件无无关变化。
2. 完整 ESLint、TypeScript、单元及 CLI 测试通过；远端冻结安装、检查、构建和发布成功。
3. Tag 指向发布提交；GitHub Release 公开且非预发布；npm latest、版本和 gitHead 一致。
4. 正式 tarball 完整性、版本元数据、两个 CLI、Skill、LICENSE、服务器及 standalone 文件验证通过；CLI 帮助和离线 Skill 可用，生产依赖不重新引入 electron-updater。
5. 记录实际结果和限制，不将未执行的完整安装、浏览器或桌面实机验证记为通过。

见[任务](./task.md)及[实施与验证](./result.md)。
