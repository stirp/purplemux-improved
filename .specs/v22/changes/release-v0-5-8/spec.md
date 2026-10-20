---
page: release-v0-5-8
title: 通过 GitHub Tag 发布 v0.5.8
status: DETAILED
created: 2026-10-21
updated: 2026-10-21
depends_on:
  - ../release-v0-5-7/spec.md
  - ../npm-install-warnings/spec.md
---

# 通过 GitHub Tag 发布 v0.5.8

## 用户需求与范围

用户要求“发布新版本吧”。当前 main 和 npm 最新版本均为 0.5.7，将当前已合并的 main 发布为补丁版本 0.5.8，包含已合并的安装依赖隔离、监控及消息等修复。

## 行为约定

- 版本目标由 0.5.7 替代为 0.5.8；执行 `npm version 0.5.8 --no-git-tag-version`，检查后创建发布提交、v0.5.8 附注标签并原子推送 main 与标签。
- 沿用 Node 24 的 `check → publish-npm → github-release`、冻结安装、npm OIDC/provenance、发布说明回退和暂停 Electron 自动发布约定。
- 沿用两个 CLI 入口、随包 Skill、Koffi 外部模块转接布局及 Node >=24 要求；保留 electron-updater 仅为开发依赖的修复，不隐藏 npm 安装脚本授权提示。
- 不新增产品行为或升级依赖。不覆盖已发布标签、不强制推送；必要阻断修复须先补充本需求约定。
- 记录本地与远端结果；npm 接收发布请求不等同于 registry 已公开可安装。

## 验收标准

1. 包版本为 0.5.8，package.json 除版本外与发布前相同，无无关锁文件变化。
2. 完整 ESLint、TypeScript、单元及 CLI 测试通过；远端 Node 24 冻结安装、检查、构建和发布通过。
3. GitHub Tag 指向发布提交，Release 公开且非预发布；官方 registry latest、版本、gitHead 一致。
4. 正式 tarball 校验完整性及版本、两个入口、Skill、LICENSE、服务器与 standalone 产物；验证 CLI 帮助和离线 Skill、生产依赖不再声明 electron-updater。
5. 独立记录尚未执行的浏览器、完整安装及桌面实机验收，补录可追溯结果。

见[任务](./task.md)和[实施与验证记录](./result.md)。
