# 实施与验证

日期：2026-10-17。对应[需求规格](./spec.md)。

## 实施

- 完成[界面详情](./detail/ui.md)及[独立交互原型](./detail/preview.html)。原型直接用浏览器打开，无需启动 Next.js。
- 包含：标签快捷筛选、多标签 AND、关键词组合、状态分组与折叠恢复、会话标签草稿、创建、保存/取消、失败重试、目录重命名/颜色/删除确认、浅深色及移动底部面板。
- 保留现有根项目 › 项目 › 会话标题层级。示例以“常驻助手”同时覆盖进行中、审批中、已完成；卡片最多两个标签及“+N”，编辑入口始终可见。
- KISS / YAGNI：只交付本轮要求的标签界面设计，不加入定时调度、收藏、保留策略或后台进程管理。原型无依赖、无网络请求，应用源码未修改。
- DRY：桌面和移动共用同一份数据与交互逻辑，通过响应式样式呈现；标签目录、卡片和会话顶部共享标签渲染。
- 浏览器检查中修正了保存后的焦点恢复和弹层首尾 Tab 循环；分组在筛选期间虽不可折叠，标题仍保持正常文字对比度。

## 验证

使用 `agent-browser --session session-tags-design` 独立 Chromium 会话，打开原型的本地 file URL。以 `snapshot -i`、`click`、`fill`、`check`、`select`、`press` 操作，用 `eval` 读取页面可见结果、布局尺寸和焦点，以截图确认外观。CLI 的 `skills get core` 在当前安装版本返回 Skill not found，因此依据已读取的本地 core 技能和实际 `--help` 使用可用命令。

| 检查 | 本次结果 |
| --- | --- |
| 单标签共存 | “常驻助手”匹配 3 个会话，分别处于进行中、审批中和已完成 |
| 多标签 AND | 勾选“常驻助手 + 周报”后仅剩周报助手，条件条明确“同时包含” |
| 关键词空结果 | 在上述条件输入无匹配关键词出现空结果；Escape 清空关键词并保留标签 |
| 保存失败与重试 | 移除“常驻助手”并模拟保存失败：原列表保留会话，弹层保留未选草稿；重试后列表剩 2 个会话，并提示该会话不再匹配 |
| 创建与取消 | 创建“月度复盘”草稿后 Escape，重新打开仍需创建，目录未污染；再次创建并保存后管理目录显示关联 1 个会话 |
| 重命名与颜色 | 将“周报”改为中文长名并选择粉色，目录更新；重复名称“工作”显示原位错误 |
| 删除确认 | 删除“常驻助手”前确认显示影响 3 个会话；确认后清除该筛选，6 个示例会话保留 |
| 标签与状态独立 | 将周报助手改为已完成，其标签保持不变，当前会话选择保持不变 |
| 折叠恢复 | 无筛选时折叠进行中，选择标签后临时展开，清除标签后恢复折叠 |
| 键盘 | 弹层首元素 Shift+Tab 返回末元素、末元素 Tab 返回首元素；Escape 关闭返回入口；保存后焦点回到会话标签编辑按钮 |
| 桌面 | 1440×1060，352px 侧栏；浅色、深色、编辑和管理对话框截图检查 |
| 移动布局 | 320×844、390×844、430×932，页面无横向溢出；筛选和编辑底部面板内操作高度均不小于 44px |
| 长名称 | 320px 下将标签改为 24 字符无空格英文名称，侧栏无可见横向溢出；快捷项区域允许内部横向滚动 |
| 浏览器脚本 | `agent-browser ... errors` 无输出，未捕获未处理异常 |
| 语法与文档 | 提取内联脚本执行 `node --check`；校验相对文档链接、depends_on 和 `git diff --check`，通过 |

关键命令示例：

```bash
agent-browser --session session-tags-design open "file:///home/home/.purplemux/worktrees/ws-_2Y-Uj/feat-custom-session-categories/.specs/v22/changes/session-custom-tags/detail/preview.html"
agent-browser --session session-tags-design set viewport 390 844
agent-browser --session session-tags-design snapshot -i
agent-browser --session session-tags-design errors
node --check "/tmp/session-tags-preview.js"
git diff --check
```

## 截图

- [设计总览](./detail/preview.png)
- [桌面浅色](./result/desktop-light.png)、[桌面深色](./result/desktop-dark.png)、[桌面编辑器](./result/desktop-editor.png)
- [手机列表](./result/mobile-light.png)、[手机标签编辑](./result/mobile-editor.png)、[手机深色筛选](./result/mobile-dark-filter.png)
- [320px 长标签](./result/mobile-320-long.png)、[保存失败](./result/save-error.png)、[标签管理](./result/tag-management.png)

## 限制

这是设计原型验收，不是应用功能验收。会话、标签和保存失败均为内存演示，刷新后还原；没有接入 API、持久化、真实 Agent、重连或跨客户端同步。未进行 iOS/Android 真机、软键盘及读屏实测。

本轮无应用源码、依赖或 Next.js API 变更；当前工作树未安装 node_modules，没有可读取的 Next.js 本地指南。没有运行应用 TypeScript、ESLint、构建和应用回归测试，不能据此声称真实应用功能实现或验收通过。后续落地须读取安装后的框架指南、复用 shadcn/ui 并执行应用级检查。
