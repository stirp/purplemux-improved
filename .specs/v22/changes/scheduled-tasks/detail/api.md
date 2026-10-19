# 定时任务 API

统一入口 `/api/scheduled-tasks?workspaceId=<工作区 ID>`，使用现有登录 Cookie 或 CLI token 认证，响应禁止缓存。

| 方法 | 请求体 | 成功响应 |
| --- | --- | --- |
| GET | 无 | 200，当前工作区任务数组，含最近执行记录 |
| POST | 任务输入 | 201，更新后的任务数组 |
| PUT | `{ id, task: 任务输入 }` | 200，更新后的任务数组 |
| PATCH | `{ id, action: "enable" / "pause" / "run" }` | 启停返回 200 和任务数组；执行返回 202 和已持久化的运行记录 |
| DELETE | `{ id }` | 200，更新后的任务数组 |

任务输入字段：`name`、`kind`（shell/claude/codex）、`cwd`、`content`、`timeoutMinutes`、`enabled`、`schedule`。拒绝未知字段。

`schedule` 为以下三种结构之一：

```json
{"frequency":"once","at":"2030-10-19T09:00:00+08:00"}
```

```json
{"frequency":"daily","time":"09:00","timeZone":"Asia/Shanghai"}
```

```json
{"frequency":"weekly","time":"09:00","timeZone":"Asia/Shanghai","weekday":1}
```

服务器添加 `id`、`workspaceId`、`nextRunAt`、`runs`，客户端不能自行写入执行状态。手动执行保留原有计划时间；暂停中的任务也能手动执行。

错误响应为 `{ error: code }`：400 表示输入/目录/日期无效，404 表示任务或工作区不存在，409 表示运行冲突/容量上限，503 表示调度器未启动或正在关闭，500 表示存储异常。服务端内部错误不直接透出到 API。

执行记录包含触发来源、开始/结束时间、进程状态、退出码、输出和截断标记。`succeeded` 仅表示进程正常退出，不代表 AI 已完成业务目标。

结果写入失败时，记录暂时保持 running；调度器保留真实结果及结束时间，每次调度和手动执行前重试保存。存储恢复后释放运行状态，不重新执行已完成任务；手动执行前的重试仍失败则返回存储异常。

创建额度在同一存储锁内先清理已删除工作区的未运行任务再计算。删除工作区也会清理其未运行任务；仍在执行或等待结果保存的任务先停用并保留运行占用，结果保存成功后清理。
