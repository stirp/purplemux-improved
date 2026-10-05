<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 按 Spec 开发（所有 AI 必须遵循）

本仓库以 `.specs/` 中的规格约束功能开发、缺陷修复及行为变更。
开始编码前先读取本文件、[CLAUDE.md](./CLAUDE.md)和相关规格。
`CLAUDE.md` 已引用本文件；统一维护此处规则，不另建 `Agent.md`。

### 规格位置

- 在 `.specs/v{N}/` 查找对应需求版本，不把 package.json 版本当作规格版本。
- 当前增量维护入口为 [.specs/v20/PRD.md](./.specs/v20/PRD.md)和[任务表](./.specs/v20/task.md)。
- `requirements/<requirement>.md`：用户原始需求、范围及验收条件。
- `PRD.md`：版本需求汇总和功能索引。
- `features/<feature>/spec.md`：功能目标、边界、验收标准和关联文档。
- `features/<feature>/detail/ui.md`：界面入口、组件映射、表单及交互。
- `features/<feature>/detail/flow.md`：操作流程、状态变化、失败及恢复行为。
- `features/<feature>/detail/api.md`：接口、数据结构、校验和兼容策略。
- `task.md`：实施和验证进度。
- `result/build-<requirement>.md`、`result/verify-<requirement>.md`：实施及验证证据。

需求规格沿用 `.specs/`；跨需求开发指南、用户手册和决策记录放在 `docs/`，按链接关联，避免重复维护。

### 必须遵守的开发顺序

1. **先定位规格**：搜索相关版本和功能，读取需求、PRD、spec、详情及 `depends_on` 引用。
   不仅查看文件名或旧版本摘要；说明本次使用的规格路径。
2. **先补齐行为约定**：不存在对应规格时，先根据用户已明确的需求创建规格；
   修改现有行为时，先更新原有规格，再改代码。
   常规实现选择可自主决定；影响范围、数据兼容或验收的关键歧义需要澄清。
3. **按验收条件实现**：保持需求、界面、流程和接口一致；不增加无需求依据的功能。
   检查默认值、旧配置兼容、错误提示、保存失败、重连及适用的桌面/移动端行为。
4. **同步维护规格**：开发中范围变化先更新规格与验收条件，并同步 PRD 索引、任务表及相关详情。
   规格与源码冲突时查明原因；不能只依据旧源码覆盖用户要求，也不能悄悄改变规格。
5. **按规格验证**：逐项将验收条件映射到测试或人工检查。
   运行有意义的相关测试、完整 TypeScript 检查和改动文件的 ESLint；
   按变更影响执行构建或浏览器验证，记录实际结果及限制。
6. **留下可追溯结果**：更新实施和验证记录，列出变更入口、检查命令、结果及未完成项。
   最终回复给出规格路径和验证结论。

### 状态与证据

- 沿用已有 frontmatter 和状态含义；`DETAILED` 表示规格详情已完成，不表示运行验收通过。
- 明确区分“规格已写”“代码已实现”“自动化检查通过”“浏览器/实机验收通过”。
- 未执行、失败或仅源码检查的项目必须如实记录，不能引用历史测试结果作为本次运行结果。
- 回补已存在实现时标明回补事实，不能声称该功能最初按先规格后编码完成。
- 小型纯格式调整可仅维护相关规格；不要为其创建重复功能模块或无用文档。
- Spec 流程不授权 Git 提交、推送、分支操作或发布；这些操作遵循用户的明确指令。

### 当前区域字体功能

- [区域字体需求](./.specs/v20/requirements/region-typography.md)
- [区域字体规格](./.specs/v20/features/region-typography/spec.md)
- [区域字体验证记录](./.specs/v20/result/verify-region-typography.md)
