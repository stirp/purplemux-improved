# Fork 标识、旧浏览器兼容与开发配置：接口与数据

## 接口或内部通道

- /api/manifest 负责 PWA 元数据。
- next.config.ts 读取 PURPLEMUX_ALLOWED_DEV_ORIGINS，package.json 声明浏览器目标和版本。

- package.json 的 bin 仅声明 purplemux-improved → ./bin/purplemux.js，不再声明 purplemux/pmux。

## 数据与执行边界

- 配置了浏览器目标不等同于所有设备已实测通过。
- 安装仅注册 purplemux-improved 命令，保留数据目录兼容；不把 npm 包可安装性或版本元数据当作已发布证据。
- 版本操作遵循 CLAUDE.md 第 17 节；本次文档任务不递增版本或创建标签。

此处说明本功能相关契约；完整字段、校验和错误分支以[规格所列源码](../spec.md)为准，不另造接口。
