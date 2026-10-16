# CLI Skill 实施与验证

日期：2026-10-17。依据：[规格](./spec.md)。

## 实施

- 新增 [pmuxi Skill](../../../../bin/skills/pmuxi/SKILL.md)，包含命令发现、连接方式、目标定位、标识区别、工作树及提交快照、队列/配置/浏览器差异和错误处理。
- [CLI 入口](../../../../bin/cli.js) 新增 `skill` 与离线帮助，读取相对于入口文件的资源，兼容任意工作目录和符号链接启动；参数错误及缺少资源通过现有错误处理非零退出。
- [原入口](../../../../bin/purplemux.js) 将 `skill` 转发到同一实现。已有 `package.json` 的 `bin/` 白名单直接覆盖 Skill，无需扩展包元数据或安装脚本。
- 中英文 README 及 [CLI 参考](../../../../landing-src/docs/zh-CN/cli-reference.md#ai-操作-skill) 增加发现、源码调用及 Codex/Claude Code 手动注册说明，明确复制后的更新方式及防覆盖处理。
- [入口测试](../../../../tests/cli/entrypoints.test.cjs) 增加两个场景，覆盖两个入口的完整离线输出、帮助和错误参数，不加载服务。
- KISS/DRY：Skill 保持单文件，详细命令参数复用当前 CLI 帮助；离线出口只负责输出，不引入安装器、额外依赖或用户目录写入。

## 验证

本次从无 `node_modules` 的工作树执行 `pnpm install --frozen-lockfile --ignore-scripts` 安装校验依赖；锁文件与依赖声明未改变。

| 验收项 | 命令或检查 | 实际结果 |
| --- | --- | --- |
| 1：Skill 格式 | `python3 /home/home/.codex/skills/.system/skill-creator/scripts/quick_validate.py bin/skills/pmuxi` | 通过：`Skill is valid!` |
| 1：指导准确性 | 对照 `bin/feature-commands.js`、`bin/cli.js` 和 CLI 标签列表/状态接口检查示例、字段和默认值 | 通过：复用现有帮助；快照、删除默认值、环境替换及浏览器存活差异与实现一致 |
| 2：离线行为及兼容性 | `pnpm test:cli` | 133 项通过，0 失败、0 跳过；包含新增入口测试及两个公开入口的既有命令回归 |
| 3：实际打包 | `pnpm pack --out /tmp/pmuxi-skill-pack-qrkt4zgv/package.tgz --json` | 通过：归档含 `package/bin/skills/pmuxi/SKILL.md`，内容与源码逐字节一致，两个 bin 不变 |
| 3：归档运行 | Python 解包、创建两个 bin 符号链接，以空临时 HOME、空 PMUX_PORT/PMUX_TOKEN，从无关目录执行 `skill` | 两个入口退出 0，stdout 与 Skill 一致、stderr 为空；恢复前临时移走归档内 Skill 时，`pmuxi skill` 退出 1 并报告 ENOENT |
| 4：完整类型检查 | `pnpm exec tsc --noEmit` | 通过 |
| 4：测试文件 ESLint | `pnpm exec eslint tests/cli/entrypoints.test.cjs` | 通过，无错误或警告 |
| 4：CLI ESLint | `pnpm exec eslint --no-ignore --ignore-pattern '!bin/**' --rule '@typescript-eslint/no-require-imports: off' bin/cli.js bin/purplemux.js` | 通过，无错误或警告；显式检查仓库默认忽略的 CommonJS 文件 |
| 4：语法 | `node --check bin/cli.js`、`node --check bin/purplemux.js` | 通过 |
| 5：文档与差异 | 检查新增相对链接、规格依赖、Skill 导出和注册示例；`git diff --check` | 通过 |

## 验证范围与限制

- 归档仅用于验证 CLI 分发与离线执行，未生成生产服务构建产物，不作为可发布的完整应用安装包。
- 本次不改变 Next.js/浏览器行为；未执行应用生产构建、浏览器或 Electron 实机验证。CLI 通过直接运行、回归和实际归档检查验证。
- 未执行全局安装、发布或写入真实用户的 Codex/Claude Code Skill 目录；未验证 Agent 在新会话中的自动发现。注册方法仅提供给用户按所用 Agent 选择执行。
- 当前本机已安装的旧 CLI 不会因源码修改而更新；可在仓库根目录使用 `node "bin/cli.js" skill` 读取本次新增指导。
