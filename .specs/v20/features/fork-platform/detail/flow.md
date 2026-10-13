# Fork 标识、旧浏览器兼容与开发配置：使用流程

## 基本流程

1. 安装包仅注册 purplemux-improved 命令，通过该命令或源码启动 fork。
2. 读取现有数据目录，按当前语言加载资源。
3. 开发环境通过允许的局域网地址访问；旧浏览器按兼容输出渲染。

## 异常与约束

- 配置了浏览器目标不等同于所有设备已实测通过。
- 安装仅注册 purplemux-improved 命令，保留数据目录兼容；不把 npm 包可安装性或版本元数据当作已发布证据。
- 版本操作遵循 CLAUDE.md 第 17 节，使用 npm version；未授权 Git 操作时通过 --no-git-tag-version 只更新版本元数据。

具体实现与测试入口见[规格](../spec.md)。

## MIT 分发保留（2026-10-13）

打包时按 Electron files 白名单选取根目录 LICENSE 并写入 app.asar，验证其内容与源码一致；完整 DMG/ZIP 验收单独记录。 约束见[MIT 分发需求](../../../requirements/mit-license-distribution.md)。
