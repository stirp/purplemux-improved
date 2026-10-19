# 接口与流程

- `GET /api/system/agent-processes`：认证后读取当前用户进程、所属工作区和未完成接入记录；不缓存。
- `POST /api/system/agent-processes`：严格校验 `{action: "stop" | "adopt", pid, startedAt, confirmed: true}`；跨站请求拒绝。服务端重新扫描核对身份，不接受客户端提供的目录、命令、会话 ID 或信号。
- 接入：识别会话 → 校验安装及目录 → 准备普通终端与持久记录 → 构建原会话恢复命令并检查目标 → 重新核对身份 → SIGTERM → 等待退出 → 持久化 stopped → 重新校验目标布局/pane/shell/目录/输入 → 持久化 dispatching → 再次校验 → 发送并绑定 Agent 终端 → 标记恢复已启动。
- 发送前校验失败时不投递，保留或恢复 stopped 供显式重试；若回写 stopped 失败则保留 dispatching 的保守语义，不推断发送结果。校验不承诺冻结外部终端输入。
- dispatching 后响应丢失时，不重复发送。重试只有在目标识别到同一会话且原进程已退出后才能完成绑定；否则提示打开目标终端处理，不假定停止或恢复成功。
- 同一服务中的操作通过 globalThis 共享串行锁，持久化复用 workspace/layout store 锁。失败返回错误和保留的接入记录，刷新后可重试。
- 返回“恢复已启动”代表恢复命令已交付；CLI 的登录、信任、权限提示及最终可用状态由既有 Agent 面板展示，不宣称已完成实机对话恢复。
