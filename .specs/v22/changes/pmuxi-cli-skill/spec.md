---
page: pmuxi-cli-skill
title: 随 CLI 分发的 AI 操作 Skill
status: DETAILED
created: 2026-10-17
updated: 2026-10-17
depends_on:
  - ../pmuxi-cli-only/spec.md
---

# 随 CLI 分发的 AI 操作 Skill

## 用户原始需求

安装后的CLI程序是否有SKILL可以给AI指导?如果没有, 请生成一份

## 现状与范围

仓库的 `.claude/skills/` 仅包含项目开发流程 Skill，包的 `files` 白名单不包含这些文件。已有 CLI 帮助和工作区 Agent 提示，但没有随 CLI 分发的操作 Skill。

本需求新增 CLI 操作指导及其离线读取入口，沿用基线的双命令分工、HTTP 接口和认证方式，不改变已有业务操作。

## 行为约定

- 单份 Skill 存放在 `bin/skills/pmuxi/SKILL.md`，通过已有 `bin/` 白名单随包发布；包含合法的 `name`、`description` frontmatter，可独立复制到 Agent 的 Skill 目录使用，不依赖源码文档。
- 新增 `pmuxi skill`，将原始 Skill 完整输出到标准输出；不需要运行中的服务，不发起 API 请求，不启动服务，不自动写入用户的 Agent 配置目录。
- `pmuxi skill --help`、`pmuxi skill -h`、`pmuxi help skill` 离线显示用法；不支持的参数非零退出。资源缺失通过现有错误处理返回非零退出，不自动启动服务。
- 原 `purplemux-improved` 入口兼容转发 `skill`；总帮助列出新命令。两个公开 bin、包版本及服务启动行为不变。
- Skill 指导 AI 使用当前版本命令帮助获取详细参数，覆盖工作区/标签定位、会话/队列、浏览器面板、工作树与提交快照、配置和错误处理。区分 workspace ID、tab ID、tmux session 与 agent session ID；不硬编码当前用户标识或 token。
- Git 提交、推送、删除、向其他会话发送指令等操作遵循用户任务授权和目标环境规则；Skill 本身不扩大授权范围。禁止将快照冲突处理为自动强制重试。
- 中英文 README 和 CLI 参考说明发现入口、源码调用方式、手动注册到 Codex/Claude Code 的方法；包自带文档与 Agent 自动发现是两回事。复制已有 Skill 前需检查目标文件，避免无意覆盖。
- 不新增安装器、不修改 postinstall、不安装全局包、不发布、不调整浏览器界面或 Agent 提示注入逻辑。

## 验收标准

1. Skill 通过格式校验，示例参数与当前 CLI 一致，详细参数使用现有帮助作为单一来源。
2. 两个入口均能离线输出与文件逐字一致的 Skill；帮助可用，未知参数失败；测试证明没有加载服务入口。
3. 实际打包归档包含 Skill，解包后通过 `pmuxi` 入口从任意目录离线读取成功。
4. CLI 回归、完整 TypeScript、改动文件 ESLint、语法及差异检查通过；执行结果和限制如实记录。
5. 中英文说明能指导用户读取并注册 Skill，明确更新方式和未自动安装；规格引用及新增文档链接可解析。

见[任务](./task.md)与[实施和验证](./result.md)。
