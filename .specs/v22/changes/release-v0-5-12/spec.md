---
page: release-v0-5-12
title: 通过 GitHub Tag 发布 v0.5.12
status: DETAILED
created: 2026-11-12
updated: 2026-11-12
depends_on:
  - ../release-v0-5-11/spec.md
  - ../new-tab-session-picker/spec.md
  - ../workspace-tab-switch-performance/spec.md
---

# 通过 GitHub Tag 发布 v0.5.12

## 用户需求与范围

用户要求“是不是后来改过代码了，再发布一个版本吧”。当前 main 已合并新建 Tab 应用及会话选择器、工作区和 Tab 切换性能优化；包、GitHub Release 与 npm latest 均为 0.5.11，将当前 main 发布为 0.5.12。

## 行为约定

- 将发布目标更新为 0.5.12，使用 `npm version 0.5.12 --no-git-tag-version`，检查后提交、创建附注标签并原子推送 main 与 v0.5.12。
- 沿用 Node 24、冻结依赖安装、`check → publish-npm → github-release`、npm OIDC/provenance、发布说明回退和暂停 Electron 自动发布约定。
- 保留 Node >=24、两个 CLI、离线 Skill、Koffi 布局及生产依赖分类；只准备发布元数据和证据，不新增产品行为或升级依赖。
- 本地静态检查结束后执行单 worker 单元测试及 CLI 测试，不放宽断言或超时；远端工作流不变。
- 不覆盖已发布版本、不移动已发布标签或强制推送；发现阻断问题先补充约定再修复。
- npm 接收请求、registry 公开和正式包验证分别记录，不将 HTTP 202 视为安装可用证据。

## 验收标准

1. package.json 仅版本变更为 0.5.12，依赖与锁文件无无关变化。
2. 完整 ESLint、TypeScript、单元及 CLI 测试通过；远端冻结安装、检查、构建和发布成功。
3. 附注标签解引用至发布提交，GitHub Release 公开且非预发布，npm latest、版本和 gitHead 一致。
4. 正式 tarball 的完整性、必要文件、版本、依赖分类验证通过；两个 CLI 的帮助与离线 Skill 可用。
5. 记录本次实际结果与未执行项，历史功能验证不冒充本次浏览器或实机验收。

见[任务](./task.md)和[实施与验证](./result.md)。
