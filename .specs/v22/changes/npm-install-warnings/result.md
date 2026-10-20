# 实施与验证

## 实施

- `package.json`、`pnpm-lock.yaml`：electron-updater 从 dependencies 移到 devDependencies，范围仍为 ^6.8.3，锁定版本仍为 6.8.3。保留 engines.node >=24.0.0 和包版本 0.5.7。
- 11 份 README 的安装要求统一为 Node 24+，中英文增加 EBADENGINE 处理说明。
- Node 要求源于提交 821ba5d；既有发布规格和 CI 使用 Node 24。没有足够验收依据将正式最低版本改为 Node 22。
- 原弃用依赖链为 electron-updater@6.8.3 → lodash.isequal@4.5.0。查询官方 registry 时，electron-updater 最新版 6.8.9 仍依赖它，因此没有无效升级上游包。
- 沿用现有 tsup noExternal 配置内联桌面更新依赖，仅调整分类；不引入替代比较算法或新封装（KISS/YAGNI），复用原打包规则（DRY），区分桌面构建与 Web 运行依赖。

## 本次验证

环境：Linux、Node v22.14.0、pnpm 12.11.2。

- `pnpm install --lockfile-only --ignore-scripts`：通过。
- `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts`：通过。pnpm 会重排既有 hookform 锁条目；恢复原排序后，使用 js-yaml.loadAll 与 assert.deepEqual 确认最终最小差异与生成锁文件语义完全相同，最终仅移动 electron-updater 条目。
- `pnpm why --prod electron-updater lodash.isequal`：安装元数据同步后无匹配。首次检查曾读取旧 node_modules 安装元数据而显示旧分类，不能作为最终结论。
- `pnpm tsc --noEmit`：通过。
- `pnpm exec vitest run tests/unit/lib/app-update-manager.test.ts tests/unit/lib/app-update-download.test.ts tests/unit/lib/app-update-api.test.ts tests/unit/lib/app-update-guard.test.ts`：29 项通过。
- `pnpm exec tsup --config electron/tsup.config.ts --out-dir /tmp/purplemux-install-warning-electron --metafile`：通过，输出位于临时目录。metafile 断言确认内联 32 个 electron-updater 源文件及 lodash.isequal 实现，外部引用只有 Node 内置模块和 Electron，不依赖遗漏的开发模块。
- Node 断言检查全部 11 份 README 的 Node 24+ 要求及锁文件分类：通过。辅助检查最初按单文档 YAML 读取 pnpm 多文档锁文件失败，改用 loadAll 并选择含 dependencies 的 importer 后通过。
- `git diff --check`：通过。无 JS/TS 源码改动，不增加源码 ESLint 检查对象。

## 限制与使用建议

- 没有执行 Node 24 检查、完整 npm 全局安装、完整 Next.js 构建或签名桌面更新实机测试；本地 Node 22 检查不构成 Node 22 正式兼容声明。
- 没有升级系统 Node、重启用户服务、提交、推送或发布。当前公开的 0.5.7 包仍有原依赖声明；修复需要后续版本发布才会影响 npm 用户。
- 现有用户先通过自己使用的 Node 版本管理器或官方安装程序切换到 Node 24，再重新安装。lodash.isequal 的弃用提示本身不表示安装失败；当前已发布版本仍会出现，源码开发安装也仍可能出现。
