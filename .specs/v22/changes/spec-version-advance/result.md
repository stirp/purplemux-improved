# 规格版本推进至 v22 实施与验证记录

## 实施

2026-10-15，依据[规格](./spec.md)，先定义版本替代条款，再更新规范入口。

- `AGENTS.md`：当前新增需求路径及搜索命令切换到 v22，明确旧需求继续维护所属版本。
- `.specs/v21/PRD.md`、`.specs/v21/task.md`：入口说明指向 v22，历史索引和任务正文保留。
- 本目录：按新规范独立保存版本推进规格、任务及记录，不增加版本级 PRD 或任务总表。

遵循 KISS/DRY，复用既有需求隔离规范；仅调整规格入口，不复制历史规格、不增加集中登记或生成工具。

## 验证

2026-10-15，本轮检查通过：

- 运行 `rg --files --hidden ".specs/v22/changes"` 及追加 `-g "task.md"` 的任务查询，成功发现本需求三份文档与独立任务表。
- 使用 `python3` 内联脚本检查本工作区九份改动 Markdown：56 个本地链接目标、两条新规格基线引用均可解析，文件末尾换行和行尾空白检查通过。
- 同一脚本通过 `git show HEAD:<path>` 比对 v21 功能索引及任务正文，确认历史内容未改写；检查 AGENTS 当前入口为 v22，v22 无版本级 PRD 或任务总表。
- `git diff HEAD -- package.json pnpm-lock.yaml package-lock.json` 无差异；`git diff --check` 通过。

仅修改 Markdown，未执行应用测试、TypeScript、ESLint、构建及浏览器验收。
