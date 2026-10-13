# MIT 许可证分发保留

日期：2026-10-13。用户确认按 MIT 要求修正 fork 项目的分发配置。

## 范围与验收

- 保留根目录 LICENSE 的原作者 `Copyright (c) 2025 subicura`、完整授权条款及免责声明；不以 fork 名称替换原声明。
- 源码仓库和 npm 包继续包含根目录 LICENSE；保留 package.json 的 MIT 元数据及 README 上游来源说明。
- Electron 应用将根目录 LICENSE 纳入文件白名单，随 app.asar 分发；不得只依赖字体或 Electron 自身的许可证。
- 使用实际 electron-builder 文件匹配器确认 LICENSE 被选中，并验证 ASAR 中许可证与根文件逐字节一致。
- 不新增版权人、不更改许可证类型、不新增界面入口。第三方依赖及字体沿用各自许可证，本次不宣称完成全依赖授权审计。
- 本地归档检查与完整 DMG/ZIP 发布验收分别记录；未执行完整安装包打包时不得声称其已验收。

规格：[fork-platform](../features/fork-platform/spec.md)。
