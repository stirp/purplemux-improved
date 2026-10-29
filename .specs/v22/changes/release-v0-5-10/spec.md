---
page: release-v0-5-10
title: 通过 GitHub Tag 发布 v0.5.10
status: DETAILED
created: 2026-10-22
updated: 2026-10-22
depends_on:
  - ../release-v0-5-9/spec.md
  - ../chat-message-timestamps/spec.md
  - ../tab-agent-identity/spec.md
---

# 通过 GitHub Tag 发布 v0.5.10

## 用户需求与范围

用户要求“发布新版本吧”。当前包和 npm latest 均为 0.5.9，将当前已合并的 main 发布为补丁版本 0.5.10，包含一键 Git 交付、Tab/Agent 关联、消息时间戳、升级提示和顶栏优化。

## 行为约定

- 版本目标从 0.5.9 更新为 0.5.10；执行 `npm version 0.5.10 --no-git-tag-version`，检查通过后提交并创建附注标签 v0.5.10，原子推送 main 与标签。
- 沿用 Node 24、冻结安装、`check → publish-npm → github-release`、npm OIDC/provenance、发布说明回退和暂停 Electron 自动发布规则。
- 保留 Node >=24、两个 CLI、随包 Skill、Koffi 布局和桌面更新依赖分类。本次只准备发布元数据与证据，不新增产品逻辑或升级依赖。
- 本地静态检查和测试分阶段运行；Vitest 使用单 worker，不放宽断言和超时。远端沿用既有工作流。
- 不覆盖已发布版本、不移动已发布标签或强制推送。发布阻断问题先补充约定再修正。
- 发布检查发现两项旧测试断言未同步已合并的增量规格：消息确认后正文与时间共存，旧 Codex 面板加载后补齐持久身份。仅更新对应测试，保留消息正文唯一、等待期间不淡出、投递状态、关闭前后时序及身份变化阻断等断言，并明确验证时间与规范化身份；不修改产品代码。
- 单独复测发现 idle-tab-close 虽 mock 文件系统和用户目录，却启动真实日志 worker 写入 /idle-close-test；按既有测试隔离方式 mock logger，不能为模拟目录申请宿主权限，不修改产品日志实现。
- npm 接收请求与正式包公开可安装分别验证，记录实际结果。

## 验收标准

1. package.json 仅版本更新为 0.5.10；锁文件和依赖无无关变动。
2. 完整 ESLint、TypeScript、单元和 CLI 测试通过；远端冻结安装、检查、构建和发布成功。
3. Tag 指向发布提交；GitHub Release 公开且非预发布；npm latest、版本与 gitHead 一致。
4. 正式 tarball 完整性、版本元数据、两个 CLI、Skill、LICENSE、服务器与 standalone 产物验证通过；CLI 帮助和离线 Skill 可用，生产依赖不重新引入 electron-updater。
5. 结果与限制可追溯，不将未执行的完整安装、浏览器或桌面实机验证记为通过。

见[任务](./task.md)及[实施与验证](./result.md)。
