# 区域字体接口与数据

## 配置结构

通过现有 `/api/config` 维护服务端 `~/.purplemux/config.json` 中的 `regionTypography`。

```typescript
interface IRegionTypography {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
}

type TTypographyRegion = 'sidebar' | 'tabs' | 'messages' | 'input' | 'terminal';
type TRegionTypography = Partial<Record<TTypographyRegion, IRegionTypography>>;
```

每个区域可独立省略字段，缺失表示沿用默认值；空对象表示全部默认。
PATCH 中显式 null、数组或标量均无效。

## 查询

`GET /api/config` 返回已有安全配置字段及可选的 `regionTypography`。
旧配置缺失字段时客户端使用空对象。
刷新、同步通知、重新连接与可见性恢复复用该接口，不新增 API。

## 保存

`PATCH /api/config` 请求示例：

```json
{
  "regionTypography": {
    "sidebar": { "fontFamily": "Microsoft YaHei, sans-serif", "fontSize": 15 },
    "terminal": { "fontFamily": "JetBrains Mono", "fontSize": 18, "color": "#aabbcc" }
  }
}
```

成功返回 200，保留 ok 字段并增加安全配置快照 config；原子保存后广播同类配置快照。
该字段按完整对象替换，不对单区域深合并。清空使用 `{"regionTypography":{}}`。
校验失败返回 400 和错误字段，不调用持久化。

## 共享校验

`src/lib/region-typography.ts` 供 API、store、预览和 CSS 生成共同使用。

- 仅允许上述五个区域及 fontFamily、fontSize、color 字段。
- 字体最多 200 字符，允许 Unicode 字母/数字、空格、下划线、点、连字符及逗号。
- 逗号分隔后的每段名称必须非空；拒绝引号、分号、花括号等 CSS 语法。
- 字号必须为有限数值且位于 8–40 范围内。
- 颜色必须为 # 加六位十六进制字符，大小写均可。
- DOM CSS 仅生成 :root 下已知区域变量和已通过验证的值；通用字体族保留关键字语义。

## 客户端失败策略

保存只有在 HTTP 成功时更新已保存 store。HTTP 或网络失败由面板提示并保留草稿。
同步失败保持已有配置；配置写入保留现有文件锁和服务端同步机制。

## Review 修复约定

界面和渲染侧保留共享校验，但保存 action 不再次拒绝负载，以服务端响应为写入权威。
等价配置直接返回，不发 PATCH；非成功响应解析 error，非 JSON 时回退 HTTP 状态。
GET、广播及保存响应均通过 updatedAt 顺序比较后 hydrate；时间戳由服务端写入生成并保持单调。

## 安全配置同步

广播为 `{ type: 'config', config: <完整安全快照> }`，排除 authPassword/authSecret，包含 hasAuthPassword。
GET 同样使用安全投影，并补充连接环境标志。广播缺少连接环境标志时客户端保留初始标志。
首次加载或重连 GET 只允许一个在途请求；比当前 updatedAt 更旧的响应不应用。

区域 CSS 变量为 `--region-<区域>-font-family`、`--region-<区域>-font-size`、`--region-<区域>-color` 和派生行高变量。
组件区域类在 globals.css 中直接消费变量，未设置时使用 revert-layer 回到原 Tailwind 层，不依赖元素标签允许列表。
