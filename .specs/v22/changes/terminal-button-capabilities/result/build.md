# 实施记录

日期：2026-10-18。规格先于本次实现补齐，见 [规格](../spec.md)。

## 实现入口

- `src/lib/terminal-keys.ts`：为按键增加稳定 ID，追加 F1–F12，集中定义默认配置、完整数组校验和旧配置归一化。序列核对本项目 `@xterm/xterm/src/common/input/Keyboard.ts` 的 112–123 分支。
- `src/types/terminal.ts`、`src/lib/workspace-store.ts`：增加可选 `terminalKeys`，接入既有内容去重、文件锁、严格读取、原子写入和广播；命令编辑保留旧客户端未提供的 `autoEnter`。
- `src/pages/api/terminal-keys.ts`、`src/hooks/use-terminal-keys.ts`、`src/hooks/use-sync.ts`：提供 GET/PUT、SWR 缓存及工作区广播/重连刷新。
- `src/components/features/workspace/terminal-key-settings.tsx`：按键显示复选框、上移/下移、保存/取消、加载重试、保存失败保留草稿及操作互斥。
- `src/components/features/workspace/terminal-key-bar.tsx`：按配置渲染，保留独立可见的设置入口，隐藏激活修饰键时清除状态。
- `src/components/features/mobile/mobile-terminal-toolbar.tsx`：删除重复的固定按键渲染，复用同一按键栏；保留移动端文本框和发送逻辑。
- `src/lib/terminal-custom-commands.ts`、`src/components/features/workspace/terminal-commands-bar.tsx`：加入可选布尔字段及编辑复选框；缺省开启，关闭时不额外追加 CR，保留已有换行归一化规则。
- `messages/*/terminal.json`：同步 11 种语言的设置入口、排序、错误反馈和自动回车说明。

## 原则与边界

- KISS / YAGNI：按键排序使用上下移动按钮，支持鼠标、键盘和触摸；不增加任意控制序列、组合键定义或新依赖。
- DRY / 单一职责：桌面和移动端共享按键渲染、配置与校验；设置表单独立于终端输入逻辑；存储继续使用现有锁与广播。
- 向后兼容：旧配置无需迁移，新增默认值在读取/执行时应用；旧客户端省略自动回车字段时保留已有设置。
- 浏览器发现原生 fieldset 的滚动内容越过底部操作区，已将滚动职责移到外层 div；修改后桌面和 390px 窄屏复验通过。

未执行提交、推送或发布。测试数据及终端使用独立临时目录。
