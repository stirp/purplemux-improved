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

## 2026-10-21 审查修正：保留 U+FEFF

### 实施

- 审查指出默认 `TextDecoder` 将八进制转义段开头的 U+FEFF 当作 BOM 删除，导致真实路径丢失字符、编辑器目标错误及展开状态标识冲突。
- 在共享 `decodePath` 中使用 `new TextDecoder('utf-8', { ignoreBOM: true })`，保留路径字符；仅调整解码器选项，不增加展示层补丁或新的状态逻辑。
- 补充 3 个路径用例，覆盖 U+FEFF 出现在独立转义段首、与中文连续编码的段首及段内；增加桌面/移动端组件用例，验证仅相差 U+FEFF 的两个文件独立展开、重排和收起，以及编辑器 URL 分别保留 `%EF%BB%BF` 或普通文件名。

### 本次验证

- 先运行新增回归测试再修改生产代码：21 项通过、4 项失败。两个路径用例丢失 U+FEFF，桌面/移动端组件均复现点击后两个文件同时展开。
- 修复后运行 `pnpm exec vitest run tests/unit/lib/parse-git-diff.test.ts tests/unit/lib/diff-file-list.test.ts tests/unit/lib/editor-file-link.test.ts`：30 项全部通过。
- `pnpm exec eslint src/lib/parse-git-diff.ts tests/unit/lib/parse-git-diff.test.ts tests/unit/lib/diff-file-list.test.ts`：通过。
- `git diff --check`：通过。
- `pnpm exec tsc --noEmit`：通过，完整项目检查；本需求文档链接检查通过。
- `pnpm build`：通过，Next.js 编译、24 个静态页生成、standalone 后处理及 tsup 服务端构建完成。仍有上述多锁文件的 workspace root 推断提示，不影响本次构建。
- 本次交互验证使用 jsdom，未执行浏览器或手机实机验收。

## PR #78 审查修正：非默认 Git 前缀

### 实施

- 来源：[Handle non-default Git diff prefixes](https://github.com/stirp/purplemux-improved/pull/78#discussion_r4328428419)。2026-10-21 读取 PR 评论、review 和全部行内审查意见，发现这一项额外问题；此前 U+FEFF 修复继续保留。
- 根因：`diff.noprefix`、`diff.mnemonicPrefix` 及自定义前缀可改变 Git 补丁格式，而共享解析器依赖 `a/`、`b/` 约定，造成二进制路径丢失或文本文件路径截断。
- `src/pages/api/layout/diff.ts`：已跟踪文件的 `git diff HEAD` 及未跟踪文件的 `git diff --no-index` 显式传入 `--src-prefix=a/ --dst-prefix=b/`。
- `src/pages/api/layout/commit-diff.ts`：普通提交的 `git diff` 及根提交的 `git show` 同样指定前缀。
- 在补丁生成端统一格式，继续复用共享解析器，避免推测无前缀路径或误删真实目录名；使用既有 Git 参数，不新增依赖或修改用户 Git 配置。
- `tests/unit/lib/git-diff-api.test.ts`：临时仓库中调用真实接口和 Git，覆盖默认、无前缀、助记前缀、两者启用及自定义前缀五种配置；每种配置验证工作区（含未跟踪文件）、普通提交和根提交。文件位于真实 `a/`、`b/`、`i/`、`w/` 目录，检查二进制名称、文本头、增删统计及配置文件未改变。

### 本次验证

- 修改生产代码前运行新接口测试：5 项通过、10 项失败，复现非默认前缀造成的路径错误。
- `pnpm exec vitest run tests/unit/lib/git-diff-api.test.ts tests/unit/lib/parse-git-diff.test.ts tests/unit/lib/diff-file-list.test.ts tests/unit/lib/editor-file-link.test.ts`：45 项通过，包含 U+FEFF 及既有组件回归。
- 改动 TS/TSX 的 ESLint 和 `git diff --check`：通过。首次完整 TypeScript 检查发现新测试请求模拟对象的类型断言问题，已修正为经 `unknown` 的显式断言。
- 修正后 `pnpm exec tsc --noEmit`：通过；本需求文档链接和新测试文件空白检查通过。
- `pnpm build`：通过，Next.js 编译、24 个静态页生成、standalone 后处理及 tsup 服务端构建完成；仍有此前记录的多锁文件 workspace root 推断提示。
- 本次接口验证使用真实 Git 2.55.0；交互仍为 jsdom 回归，未执行浏览器/手机实机验收。
