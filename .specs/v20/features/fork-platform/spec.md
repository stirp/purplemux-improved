---
page: fork-platform
title: Fork 标识、旧浏览器兼容与开发配置
route: '现有工作区与 Agent 界面，详见 detail/ui.md'
status: DETAILED
complexity: Medium
depends_on:
  - CLAUDE.md
created: 2026-09-28
updated: 2026-10-10
assignee: ''
---

# Fork 标识、旧浏览器兼容与开发配置

## 概述

记录 fork 基线 `52140216` 之后、截至 `3637a357` 的新增或增强行为。此文档是现有实现的回补规格，不表示本次重新实现或完成运行验收。

## 主要功能

- 应用与包标识使用 purplemux-improved；包安装仅注册 purplemux-improved 命令，保留 ~/.purplemux 数据目录。
- Electron 应用、安装包与启动服务标识同步调整，macOS LaunchAgent 标签为 `com.stirp.purplemux-improved.server`；CLI 帮助和站点文档同步使用 fork 名称。
- 补齐 fork 功能的多语言资源与说明文档；PWA manifest 和访问处理随 fork 调整。
- 通过 browserslist、CSS 输出和 Markdown 自动链接补丁兼容旧 Safari/iOS 浏览器目标。
- 开发允许来源包含本机网络地址，并支持 PURPLEMUX_ALLOWED_DEV_ORIGINS 配置。
- 应用包版本目前为 0.5.1；版本号是累计功能快照的元数据。

## 边界与约束

- 配置了浏览器目标不等同于所有设备已实测通过。
- 不再注册 purplemux/pmux 命令别名；保留数据目录兼容，不把 npm 包可安装性或版本元数据当作已发布证据。
- 版本操作遵循 CLAUDE.md 第 17 节；本次文档任务不递增版本或创建标签。

## 验收标准

- 打包后的 package.json 的 bin 仅包含 purplemux-improved，指向现有 bin/purplemux.js；安装不得额外注册 purplemux 或 pmux。
- CLI 帮助、Claude/Codex 工作区提示及安装文档使用 purplemux-improved 命令，不引导调用已取消的别名。
- ~/.purplemux 数据目录保持兼容，多语言资源可加载。
- 已安装的独立上游包及外部创建的旧命令不由本包自动删除。
- 旧 Safari 自动链接解析不依赖不支持的正则特性。
- 当前包版本为 0.5.1，开发来源只按配置和本机地址扩展。

## 实现依据

- [package.json](../../../../package.json)
- [next.config.ts](../../../../next.config.ts)
- [bin/purplemux.js](../../../../bin/purplemux.js)
- [bin/cli.js](../../../../bin/cli.js)
- [electron/main.ts](../../../../electron/main.ts)
- [electron-builder.yml](../../../../electron-builder.yml)
- [landing-src/_data/site.js](../../../../landing-src/_data/site.js)
- [src/pages/api/manifest.ts](../../../../src/pages/api/manifest.ts)
- [patches/mdast-util-gfm-autolink-literal@2.0.1.patch](../../../../patches/mdast-util-gfm-autolink-literal@2.0.1.patch)

## 已有测试索引

以下文件为仓库已有测试，本次文档任务未重新运行。

- [tests/unit/api/pwa.test.ts](../../../../tests/unit/api/pwa.test.ts)
- [tests/unit/lib/css-browser-compatibility.test.ts](../../../../tests/unit/lib/css-browser-compatibility.test.ts)
- [tests/unit/lib/markdown-browser-compatibility.test.ts](../../../../tests/unit/lib/markdown-browser-compatibility.test.ts)

## 下级文档

- [界面与交互](./detail/ui.md)
- [使用流程](./detail/flow.md)
- [接口与数据](./detail/api.md)
- [统一验证记录](../../result/verify-1.md)

## 变更历史

| 日期 | 内容 | 状态 |
| --- | --- | --- |
| 2026-10-10 | 按 Linux 安装反馈取消旧 CLI 别名，仅保留 purplemux-improved；见[需求](../../requirements/single-cli-install.md) | DETAILED |
| 2026-09-28 | 回补 fork 后累计功能；关联提交：`58cd8488`, `bdc766a6`, `b76046b8`, `6fd119f2`, `3637a357` | DETAILED |
