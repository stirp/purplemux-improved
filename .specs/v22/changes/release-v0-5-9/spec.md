---
page: release-v0-5-9
title: 发布包含 Codex 启动修复的 v0.5.9
status: DETAILED
created: 2026-10-21
updated: 2026-10-21
depends_on:
  - ../release-v0-5-8/spec.md
  - ../codex-launch-lifecycle/spec.md
---

# 发布包含 Codex 启动修复的 v0.5.9

## 用户需求与范围

用户要求：“有些堵塞性 bug 处理了，重新发这个版本吧”。核验时 v0.5.8 已在 npm 正式公开，latest 为 0.5.8，GitHub Release 也已存在，不能覆盖同一 npm 版本。将最新已合并的 Codex 启动器等待和 Chat 启动状态修复发布为下一个补丁版本 v0.5.9。

## 行为约定

- 发布目标由 v0.5.8 改为 v0.5.9，保留已发布的 v0.5.8 标签及产物。以当前 main 中 PR #80、#81 的合并结果为发布内容，不额外修改产品行为。
- 用 `npm version 0.5.9 --no-git-tag-version` 更新版本，通过检查后提交、创建附注 Tag 并原子推送 main 与 v0.5.9；不强制推送或覆盖标签。
- 沿用 Node 24、冻结安装、`check → publish-npm → github-release`、npm OIDC/provenance、发布说明回退及暂停 Electron 自动发布规则。
- 保留 Node >=24、两个 CLI、Skill、Koffi 布局及桌面更新依赖分类；仅变更版本元数据和发布记录，不升级依赖。
- 本地测试与静态检查分阶段执行，全量 Vitest 使用单 worker 避免本机资源争用，不修改断言及超时。远端继续按既有工作流运行。
- npm 接收发布请求和正式公开可安装分别验证；记录实际结果和限制。

## 验收标准

1. 版本为 0.5.9，除版本外 package.json 与发布前一致；锁文件无无关变化。
2. 完整 ESLint、TypeScript、单元及 CLI 测试通过；远端 Node 24 冻结安装、检查、构建和发布成功。
3. Tag 指向包含两次 Codex 修复的发布提交；GitHub Release 公开且非预发布，npm latest、gitHead、版本一致。
4. 正式 tarball 完整性及必要包文件校验通过；两个 CLI 的帮助和离线 Skill 验证通过；正式生产依赖不重新引入 electron-updater。
5. 不把未执行的完整全局安装、浏览器或桌面实机验收记为通过；结果记录包含链接与实际证据。

见[任务](./task.md)和[结果](./result.md)。
