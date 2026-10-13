# Fork 标识、旧浏览器兼容与开发配置：接口与数据

## 接口或内部通道

- /api/manifest 负责 PWA 元数据。
- next.config.ts 读取 PURPLEMUX_ALLOWED_DEV_ORIGINS，package.json 声明浏览器目标和版本。

- package.json 的 bin 仅声明 purplemux-improved → ./bin/purplemux.js，不再声明 purplemux/pmux。

## 数据与执行边界

- 配置了浏览器目标不等同于所有设备已实测通过。
- 安装仅注册 purplemux-improved 命令，保留数据目录兼容；不把 npm 包可安装性或版本元数据当作已发布证据。
- 版本操作遵循 CLAUDE.md 第 17 节，使用 npm version；未授权 Git 操作时通过 --no-git-tag-version 只更新版本元数据。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。

## MIT 分发保留（2026-10-13）

Electron 的 files 明确包含根目录 LICENSE，归档路径为 app.asar 内的 LICENSE；内容以仓库根目录原作者 MIT 文本为准。npm 包继续保留 LICENSE。 约束见[MIT 分发需求](../../../requirements/mit-license-distribution.md)。
