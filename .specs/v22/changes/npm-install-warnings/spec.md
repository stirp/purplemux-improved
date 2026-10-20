---
page: npm-install-warnings
title: npm 安装环境说明与桌面构建依赖隔离
status: DETAILED
created: 2026-10-20
updated: 2026-10-20
depends_on:
  - ../release-v0-5-7/spec.md
  - ../auto-upgrade-detection/spec.md
---

# npm 安装环境说明与桌面构建依赖隔离

## 用户需求

用户使用 Node v22.14.0、npm 11.19.0 全局安装 purplemux-improved@0.5.7，收到 Node >=24.0.0 的 EBADENGINE 和 lodash.isequal@4.5.0 弃用警告，要求排查修复。

## 行为约定与边界

- 沿用发布基线的 Node >=24.0.0 和 CI Node 24；各语言 README 安装要求统一为 Node 24+。中英文说明 EBADENGINE 的处理方式：切换 Node 24 后重新安装。不把本地 Node 22 的局部检查当作正式兼容承诺。
- 覆盖原依赖分类：electron-updater 仅用于 Electron 构建，移到 devDependencies，保持版本范围和锁定版本不变；npm 消费安装不再经此路径引入 lodash.isequal。
- 保持 Electron 更新功能及现有 tsup 内联打包约定，不能因依赖分类调整而缺少运行模块。开发依赖仍可能产生该上游弃用警告，不替换其相等比较算法，不隐藏警告。
- 保持 Web/CLI 入口、Node engine、包版本和其余依赖不变。不升级用户全局 Node、不重启服务、不提交或发布。

## 验收标准

1. package.json 与锁文件分类一致，冻结锁文件校验通过，生产依赖树无 electron-updater 和 lodash.isequal。
2. Electron 主进程构建通过，产物包含 updater 及其依赖实现；验证外部模块引用仍可由 Electron/生产依赖提供。
3. 完整 TypeScript 和相关更新测试通过；仅元数据/文档变化，无新增源码 ESLint 对象。
4. 各语言 README 无 Node 20+ 安装要求，中英文有明确的版本不匹配处理说明。
5. 记录实际检查环境及未执行的 Node 24、完整安装、桌面更新实机验证；说明已发布的 0.5.7 不会随本地修改改变。

见[任务](./task.md)及[结果](./result.md)。
