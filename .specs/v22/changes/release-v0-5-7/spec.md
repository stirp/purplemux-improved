---
page: release-v0-5-7
title: 通过 GitHub Tag 发布 v0.5.7
status: DETAILED
created: 2026-10-20
updated: 2026-10-20
depends_on:
  - ../release-v0-5-6/spec.md
  - ../auto-upgrade-detection/spec.md
---

# 通过 GitHub Tag 发布 v0.5.7

## 用户需求与范围

用户要求：“发布新版本吧”。当前包与最新发布版本均为 0.5.6，延续此前流程，将当前已合并 main 发布为补丁版本 0.5.7。

## 行为约定

- 版本目标由 0.5.6 替代为 0.5.7；使用 `npm version 0.5.7 --no-git-tag-version` 更新版本，检查通过后提交并创建 v0.5.7 附注标签，原子推送 main 与标签。
- 沿用 Node 24 下 `check → publish-npm → github-release`，保留冻结安装、npm OIDC/provenance、发布说明回退及暂停 Electron 自动发布约定。
- 包名、两个 CLI 入口、随包 Skill、Koffi 依赖布局沿用基线；不新增产品行为、升级依赖或修改工作流。
- 不覆盖既有远端标签、不强制推送；必要的发布阻断修正先补充规格再实施。
- 发布检查发现 PageShell 滚动锁生命周期测试未隔离新增的 AppUpdateSettings 子组件，导致缺少国际化上下文而失败；沿用该测试对子组件的 mock 方式补齐替身，保持桌面/移动端挂载及卸载断言，不修改产品实现。
- npm 接收发布请求与版本公开可用分别记录；不以 HTTP 202 作为发布包可安装的证据。

## 验收标准

1. 包版本为 0.5.7；除版本外，package.json 与本次发布前一致，锁文件无无关变更。
2. 本地完整 ESLint、TypeScript、单元及 CLI 测试通过；远端冻结安装、检查及生产构建通过。
3. 远端 Tag 对应发布提交，Actions 成功，GitHub Release 已公开且非预发布。
4. 官方 registry 的 0.5.7、latest 和 gitHead 正确；tarball 可下载、SHA-512 一致，包含版本元数据、两个入口、Skill、LICENSE、服务器及 standalone 产物。
5. 包内 pmuxi 帮助与 skill 离线读取通过；Koffi 依赖声明及 standalone 转接加载通过，官方依赖包包含 macOS 双架构原生文件。
6. 任务与实施验证记录可追溯，未执行的浏览器、完整安装及 macOS 实机验收如实说明。

见[任务](./task.md)和[实施与验证记录](./result.md)。
