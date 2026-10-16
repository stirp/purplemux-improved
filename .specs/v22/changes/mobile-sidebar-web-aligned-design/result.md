# 设计交付与验证

日期：2026-10-16。本文件仅记录设计阶段；用户确认后的应用实施与验证见 [实施记录](./result/build.md)和[验证记录](./result/verify.md)。

## 实施

- 读取移动导航、空工作区选择、工作树层级、状态管理和 Web 紧凑侧栏基线，检查当前源码及已有 Web 浅深色截图。
- 新建设计规格及交互约定，明确常显更多、底部操作面板、紧凑信息与搜索相对既有条款的替代关系。
- 生成自包含 [HTML 预览](./detail/preview.html)与[三联截图](./detail/preview.png)，包含浅色导航、深色导航和项目操作面板。
- 未修改应用源码、配置或依赖。KISS/YAGNI：限定为现有导航能力的布局与入口设计；DRY：实施建议复用现有搜索、状态和管理流程，不新增后台模型。预览用单独示例数据，不读写真实工作区。

## 本次验证

通过独立 `agent-browser --session mobile-sidebar-design` 浏览器会话执行：

| 检查 | 实际结果 |
| --- | --- |
| 运行页面检查 | localhost:8022 跳转 /login；未进入登录后的移动界面，不声称完成现状实屏验收 |
| 设计截图 | 打开 preview.html，1320×1050 视口，检查浅深色和操作面板，截图保存至 detail/preview.png |
| 模拟手机框宽度 | 320/390/430px 外框下，抽屉实际宽度 294/364/400px，无抽屉横向溢出；前两个数值包含外框两侧共 2px 边框的影响 |
| 点击尺寸 | 三种框宽下项目行最小 48px、更多按钮最小高度 46px、页签最小高度 44px |
| 搜索分支 | 输入 feat/mobile-sidebar，仅保留 purple 根与 mobile 子项；清空恢复 |
| 搜索无结果 | 输入 no-such-project，出现无结果提示；清空恢复 |
| 展开收起 | 点击 purple 根后 mobile 子行隐藏 |
| 操作面板 | 点击 mobile 更多，dialog 打开且包含完整目录、分支和审批中状态；Escape 关闭 |
| 运行错误 | 浏览器 errors 输出为空 |

常用命令：

```bash
agent-browser --session mobile-sidebar-design open "file:///绝对路径/detail/preview.html"
agent-browser --session mobile-sidebar-design set viewport 1320 1050
agent-browser --session mobile-sidebar-design screenshot "detail/preview.png"
agent-browser --session mobile-sidebar-design errors
git diff --check
```

初次尝试 browser-harness 时命令不存在；当前 agent-browser 不支持技能指南中的 skills get core 与 doctor 命令，改用已读取的本地 core 指南及实际 CLI help 完成预览验证。

## 限制

本次完成设计及原型浏览器检查，未完成应用实现。静态三联图第三屏用于展示面板构图；真实开关演示通过前两屏的更多按钮完成。工作区搜索和菜单为原型行为，不替代应用业务回归。

未执行应用 TypeScript、ESLint、构建、真实 Agent/WebSocket、iOS/Android 实机、系统输入法、软键盘、安全区和读屏验收。本次不修改应用代码，应用检查不适用；后续实现须逐项执行 spec.md 的验收清单。
