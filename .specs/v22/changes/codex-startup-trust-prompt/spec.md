---
page: codex-startup-trust-prompt
title: Codex 启动信任提示恢复
status: DETAILED
depends_on:
  - ../../../v20/requirements/claude-startup-prompts.md
  - ../../../v20/features/agent-runtime/spec.md
  - ../../../v19/features/codex-panel-ui/spec.md
  - ../codex-launch-lifecycle/spec.md
  - ../../../v20/features/terminal-rendering/spec.md
---

# Codex 启动信任提示恢复

## 用户原始需求

当启动 codex 会话时，codex 提问是否 trust 项目，但是 chat 界面会显示在连接中。预期是显示问题并允许界面选择；如果困难，可以考虑界面弹出 terminal 部分，供用户选择。

## 范围与行为

- 桌面和移动端一致。沿用已解析终端缓冲、会话隔离和信任 Hook，不新增接口、持久化配置或计时轮询。
- 兼容旧版 Codex 的 `Do you trust the contents of this directory?`，继续显示已有信任卡片并按用户选择发送数字。
- 新版 Codex 的 `Folder access` / `Trust this folder?` 以及 `Trust and continue` 菜单包含受限打开等不同语义，不能套用旧版“否＝退出”。仅在未绑定 Agent 会话 ID、CLI 为 inactive/unknown 的启动阶段，检测到此原生菜单后自动切换当前标签到终端，展示原始问题并允许直接操作；不代替用户信任目录、不模拟答案。已绑定会话或已进入工作状态时不根据文本自动切换，原生提示由已有终端入口手动处理。
- 自动切换复用已有 panelType 切换能力，不关闭、重启或新建会话。选择完成后用户可通过已有面板切换入口返回 Chat，不强制跳回。
- 为 Codex 启动页（包括未失败的等待阶段）和旧版信任卡片增加“查看终端”入口，未知提示也可手动处理。此条扩展 panel-ui 与 launch-lifecycle 的启动 UI，其余状态判断、升级提示优先级、Claude 行为保持不变。
- 启用、重连输出、标签/会话变化时重新检测；旧标签结果不得触发新标签切换。启动条件变化立即屏蔽旧检测，普通聊天中原样引用完整菜单也不得自动切换或导致返回 Chat 后循环跳转。
- 桌面折叠 Agent 终端继续使用至少 40 行及已记录的可见高度，但在本地 xterm 拟合前统一计算最终尺寸，本地缓冲、WebSocket 首次连接和后续 resize 均使用相同尺寸。禁止先按较小 DOM 高度缩小再放大，以免 ANSI 定位内容丢失；展开或切回普通终端后按可见尺寸拟合。移动端、登录终端和未传入尺寸策略的调用保持默认拟合。

## 验收

1. 启动阶段的新版菜单（包括窄屏换行、受限打开、返回等选项）能触发当前标签终端展示，不发送 stdin；两端接入相同检测结果。
2. 旧版 Codex 与 Claude 信任解析和提交继续通过；新版菜单不被错误转换为旧版 yes/no。
3. 提示消失时清除检测；启用检测已有缓冲、禁用、切换标签/会话、重连输出均正确，过期结果不切换新标签。
4. Codex 启动等待、启动失败和旧版信任卡片均有可点击的终端入口，两端复用已有切换行为。
5. 执行相关回归、完整 TypeScript、改动文件 ESLint 和构建，分别记录自动化、浏览器及真实 CLI 验证的证据和限制。
6. 正常工作状态或已绑定会话时，即便缓冲包含完整菜单也不自动切换；启动检测等待期间进入会话立即阻断旧结果，返回 Chat 不循环跳转。
7. 折叠状态 DOM 仅容纳 12 行时，本地 xterm 与 PTY 同为至少 40 行，菜单标题和第 30 行选择项均可读取；重连、字体变化、ResizeObserver、手动拟合不短暂缩小缓冲，展开后恢复可见尺寸。

见 [任务](./task.md) 与 [实施和验证](./result.md)。
