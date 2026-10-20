# 实施与验证记录

## 实施

- 根因：`parseMultiFileDiff` 只从文本差异的 `---` / `+++` 行读取名称；二进制差异没有这两行，旧/新名称均为空，使显示回退为 `file`，且多个卡片使用相同展开状态标识。
- `src/lib/parse-git-diff.ts`：从 `diff --git` 头初始化路径；解码 Git 引号、转义和八进制 UTF-8；保留空格，使用重命名元数据及显式文件头更新路径；新增/删除使用 `/dev/null` 表示不存在的一侧。识别普通二进制差异与 `GIT binary patch`。
- 复用现有 `DiffFileList` 的仓库、比较引用和旧/新路径标识，无需增加展开状态或修改组件；恢复的路径同时修复编辑器目标。路径解码集中在解析器，避免展示层重复修补，保持实现范围简单。
- `tests/unit/lib/parse-git-diff.test.ts`：覆盖二进制新增/修改/删除、空格、中文、引号、反斜杠、控制字符、重命名、纯模式变更和文本差异回归。
- `tests/unit/lib/diff-file-list.test.ts`：挂载真实组件，验证独立展开/收起、刷新、重排、仓库及引用隔离、编辑器目标，以及二进制展开不请求文本内容。

## 验证

2026-10-20 在本需求工作树执行，未复用历史运行结果。

| 验收项 | 检查 | 结果 |
| --- | --- | --- |
| BF-01、BF-02、BF-05 | `pnpm exec vitest run tests/unit/lib/parse-git-diff.test.ts tests/unit/lib/diff-file-list.test.ts tests/unit/lib/editor-file-link.test.ts` | 25 项通过，包括既有编辑器链接回归 |
| BF-03、BF-04 | 上述组件交互测试，桌面/移动端 hook 分支分别执行 | 通过；相同 basename 的不同目录文件独立展开，编辑器点击不改变展开状态 |
| BF-06 | `pnpm exec tsc --noEmit` | 通过，完整项目类型检查 |
| BF-06 | `pnpm exec eslint src/lib/parse-git-diff.ts tests/unit/lib/parse-git-diff.test.ts tests/unit/lib/diff-file-list.test.ts` | 通过，无问题 |
| BF-06 | `pnpm build` | 通过，Next.js 编译、24 个静态页生成、standalone 后处理及 tsup 服务端构建完成 |
| 文档与格式 | `git diff --check`，新增文件尾随空白扫描、本需求 Markdown 链接及 depends_on 路径检查 | 通过 |

另使用临时文件调用真实 `git diff --no-index /dev/null <file>`，核对普通、空格、包含 ` b/`、中文、引号、反斜杠及末尾空格文件名的 Git 输出格式。

## 限制

- 交互验证使用 jsdom 挂载真实列表组件；未执行浏览器视觉验收或手机实机验证。
- 本次验证直接提供 Git 差异文本，不涉及现有接口的未跟踪文件枚举策略。
- 构建提示存在多个锁文件，推断 `/home/home` 为 workspace root；构建成功，本次未调整项目构建配置。
