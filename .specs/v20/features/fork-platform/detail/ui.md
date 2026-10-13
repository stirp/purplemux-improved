# Fork 标识、旧浏览器兼容与开发配置：界面与交互

## 入口与展示

应用标识、安装说明和 PWA 展示使用 fork 名称；旧 Safari 下布局与 Markdown 保持可用。

## 交互验收

- 安装仅注册 purplemux-improved 命令，数据目录保持兼容，多语言资源可加载。
- 旧 Safari 自动链接解析不依赖不支持的正则特性。
- 当前包版本为 0.5.2，开发来源只按配置和本机地址扩展。

## 异常与边界

- 配置了浏览器目标不等同于所有设备已实测通过。
- 安装仅注册 purplemux-improved 命令，保留数据目录兼容；不把 npm 包可安装性或版本元数据当作已发布证据。
- 版本操作遵循 CLAUDE.md 第 17 节，使用 npm version；未授权 Git 操作时通过 --no-git-tag-version 只更新版本元数据。

本次记录现有交互；未实际运行浏览器验证。功能范围及源码入口见[规格](../spec.md)。

## MIT 分发保留（2026-10-13）

MIT 版权及授权文本随分发包保存，不新增 UI；README 的上游来源说明和许可证链接继续保留。 约束见[MIT 分发需求](../../../requirements/mit-license-distribution.md)。
