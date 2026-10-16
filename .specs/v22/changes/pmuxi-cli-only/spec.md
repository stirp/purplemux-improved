---
page: pmuxi-cli-only
title: pmuxi 专用 CLI 入口
status: DETAILED
created: 2026-10-16
updated: 2026-10-16
depends_on:
  - ../../../v20/requirements/single-cli-install.md
  - ../../../v20/features/fork-platform/spec.md
---

# pmuxi 专用 CLI 入口

## 用户原始需求

目前 cli 和 purplemux-improved 同名，多少有些困扰，一不小心就会再启动一个。增加 pmuxi 命令，专用于 cli 用途，不能启动 server，专用于 cli 完成各种操作。

## 范围与行为约定

- 包增加 `pmuxi` → `bin/cli.js`，直接复用现有 CLI 分发和 HTTP 客户端，不经过服务启动入口。
- `pmuxi` 无参数、`help`、`-h`、`--help` 均离线显示帮助并成功退出；`features` 和已有命令组帮助继续离线可用。
- `pmuxi start`、`pmuxi server`、未知命令和服务启动参数均以非零状态退出，不加载或启动 server，不执行自动启动或重连拉起服务。
- 所有已有 CLI 操作、参数、请求、认证和输出语义继续复用；服务未启动、配置缺失或连接失败时报告错误，不启动服务。
- `purplemux-improved` 无参数及 `start` 仍可启动服务，已有 CLI 调用继续兼容。
- CLI 帮助、Claude/Codex 工作区提示及中英文 README/CLI 参考文档推荐使用 `pmuxi`；说明服务由 `purplemux-improved` 独立启动。
- 源码环境的操作示例明确将 `pmuxi` 替换为 `node bin/cli.js`，确保执行当前 checkout 的 CLI，而非全局安装版本或服务启动入口。
- 显式替代依赖规格中“包仅注册 purplemux-improved 一个命令”和“CLI 帮助及提示使用唯一命令”的条款。包名、版本、数据目录、现有 API 及不注册 `purplemux`/`pmux` 的约定不变。
- 不涉及 UI、Electron 打包、全局安装、发布或既有历史规格改写；其他语言的旧 CLI 用法仍兼容。

## 验收标准

1. 包元数据包含且仅包含 `purplemux-improved` 与 `pmuxi` 两个 bin，入口文件随包分发。
2. 无服务环境下，`pmuxi` 无参数与帮助命令成功退出，提示使用 `pmuxi` 并说明不会启动服务。
3. `start`、`server`、未知命令、服务启动参数及配置缺失/连接失败均不触发服务入口；错误场景非零退出。
4. 现有 CLI 回归对两个公开入口均通过，覆盖命令分发、请求方法/载荷、认证、上传及错误处理；原启动入口兼容。
5. 帮助、Agent 提示及中英文文档体现命令分工；完整 TypeScript、改动文件 ESLint、CLI 语法和差异检查通过，未执行项如实记录。
6. 中英文 CLI 参考中的源码替换说明统一为 `pmuxi` → `node bin/cli.js`，与当前示例一致；纯文档修正检查说明、路径及差异格式。

见[任务](./task.md)与[实施和验证](./result.md)。
