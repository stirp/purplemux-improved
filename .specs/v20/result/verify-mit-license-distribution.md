# MIT 许可证分发保留验证记录

日期：2026-10-13。对应[需求](../requirements/mit-license-distribution.md)。

## 本轮检查

- 使用已安装 app-builder-lib 的 getMainFileMatchers，读取真实 electron-builder.yml、mac 配置及输出目录，调用 createFilter：根目录 LICENSE 被选中。
- 使用已安装 @electron/asar 将所选 LICENSE 写入临时验证归档，extractFile 读回后与原文件逐字节比较，通过。归档为 `/tmp/purplemux-mit-w5WnQM/license-check.asar`；仅包含许可证，不是完整应用。
- 核对原作者 `Copyright (c) 2025 subicura` 和声明保留条款，验证通过；`git diff --exit-code -- "LICENSE" "package.json"` 确认未改动既有授权文本和元数据。
- `pnpm exec npm pack --dry-run --ignore-scripts --json` 的文件清单包含根目录 LICENSE；仅本地预览，没有执行发布或生命周期构建脚本。
- `pnpm tsc --noEmit` 完整类型检查通过。
- `git diff --check` 通过。

## 验证范围

本次仅改动 YAML 白名单与规格文档，无 JS/TS 源码改动；配置使用 electron-builder 实际采用的 js-yaml 解析和文件匹配规则检查，ESLint 不适用于该 YAML。未添加重复配置实现的单元测试，未重复运行无关业务测试或 Next.js 构建。

未生成完整 macOS DMG/ZIP、未安装验收、未签名/公证、未发布。ASAR 验证仅证明当前匹配规则选中许可证且归档内容可完整保存，不代替最终安装包检查。未执行第三方依赖全量许可证审计。
