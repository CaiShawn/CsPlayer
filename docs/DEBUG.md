# CsPlayer 调试记录

## 2026-06 · 最近播放（`/record/recent/song`）失败与搁置

### 背景

v0.1.1 需要「最近播放」列表。设计文档最初指定数据源为 `user_record`，但该接口语义是**听歌排行**（按播放次数聚合的 `allData` / `weekData`），不是按时间倒序的播放历史。因此改用 MusicLibrary 中标注为「最近播放-歌曲」的 `record_recent_song`（上游 `/record/recent/song`）。

### 现象

1. 页面加载 `/api/user/recent` 时前端报错：
   ```
   exception: access violation writing 0x0000000000000000
   ```
2. 后端 FastAPI 全局异常处理把上述原生异常字符串返回给前端。
3. 复现路径：已登录（带 cookie 会话）→ 打开「最近播放」→ 必现。
4. 未登录 / 空 cookie 时对 `record_recent_song(limit=50|1|默认)` 探测返回 `status=200`，不崩；**带登录态**调用才触发原生崩溃。

### 排查过程

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 对照设计文档，怀疑 `user_record` 语义用错 | `user_record` 是听歌排行，确实不适合作「最近播放」 |
| 2 | 改用 `record_recent_song(limit=50)`，按 `playTime` 倒序解析 `data/resource/song` | 逻辑正确，但登录态调用崩溃 |
| 3 | 空 cookie 探测 `record_recent_song` / `recent_listen_list` / `user_record` | 前两个 200；`user_record` 无权限 400（需 uid+登录） |
| 4 | 去掉 `limit` 参数再调 `record_recent_song` | 登录态仍可能 `access violation` |
| 5 | 多源回退：`recent_listen_list` → `record_recent_song` → `user_record` | 最近播放仍失败（原生崩溃/空数据），无法稳定展示 |
| 6 | 在 `ncm_call` 捕获异常并重建 `NeteaseCloudMusicApi` 实例 | 仅能避免整条 SDK 链路瘫痪，不能修复该路由本身 |

### 结论

- MusicLibrary（QuickJS / `ncm_music_api.dll`）在登录态访问 `/record/recent/song` 时存在原生崩溃（写空指针），属绑定/上游脚本问题，应用层无法可靠修复。
- `recent_listen_list` 亦未能提供可用的最近播放列表。
- **决策**：暂时搁置「最近播放」功能；本版改为展示 **听歌排行榜**，数据源固定为 `user_record`（`allData` 全量 / `weekData` 一周）。

### 复现备忘

```text
MusicLibrary: NeteaseCloudMusicApi.record_recent_song(cookie={...登录态...})
异常: exception: access violation writing 0x0000000000000000
空 cookie 时不崩溃；带 MUSIC_U 等会话 cookie 时崩溃
```

### 后续（若重启最近播放）

1. 等 MusicLibrary / NeteaseCloudMusicApi 修复 `/record/recent/song` 绑定后再接入。
2. 或改为自管 HTTP 会话调用网易云官方最近播放接口，绕开 MusicLibrary 该路由。
3. 恢复前对照本节现象做登录态回归。

---

## 2026-06 · 歌单/我喜欢 偶发 502 排查与子进程隔离落地（本节取代下文「隔离方案暂不实施」的决策）

### 现象

1. 访问「我喜欢」/歌单详情（`/playlist/detail` + `/playlist/track/all`）高概率 502；失败点会漂移（有时挂在 detail 一步、有时挂在 track/all），同一调用单独复现又正常。
2. 加了服务端日志后抓到真实原因：
   ```text
   [ROUTE] route: /playlist/detail, ... params: {"id":563383913}
   SDK 调用疑似原生崩溃: playlist_detail (第 1 次尝试): exception: access violation writing 0xFFFFFFFFFFFFFFF9
   Registering environment variables: ...   ← 同实例重试开始
   （随后整个 uvicorn 进程硬崩）
   ```
3. 实验证伪了两种进程内缓解：
   - **重建实例**（旧方案）：崩溃后 `_reset_api()` + 新 `NeteaseCloudMusicApi()` 会二次 `ncm_init`，在已污染的堆上**必崩**（`_NcmContextManager.get_ctx()` 首次调用后 `_ctx=None`，新实例构造会再走 `ncm_init`）。
   - **同实例重试**（本次先行修复）：access violation 是野生内存写，异常被 ctypes 包成 OSError 抛出时堆已写坏；重试再次进入原生代码 → **进程硬崩**，try/except 拦不住。

### 结论

- **进程内无法可靠防护原生崩溃**：try/except 只能接到崩溃的“回声”（异常），接不到崩溃本身（堆损坏/硬崩）。
- **唯一硬保证是 OS 进程边界**：SDK 必须运行在可丢弃的子进程里；崩溃只死子进程，主进程换新进程继续服务。
- 崩溃后**任何进程内重试都是危险操作**；重试只能在“全新子进程”（干净的堆）里做。

### 实施：子进程隔离 Worker（替代上文「同进程策略」决策）

```text
FastAPI 主进程（永不 import MusicLibrary 原生层）
  └─ ncm_client（RPC 客户端，单线程 executor 串行）
       └─ multiprocessing.Pipe（二进制 pickle；不走 stdio——SDK 会往 stdout 打噪声）
            └─ ncm_worker 子进程（唯一持有 SDK/QuickJS，可随时丢弃重建）
```

协议与行为：

1. 请求 `{"fn", "cookie", "kwargs"}` → 响应 `{"ok": true, "status", "headers", "body"}` / `{"ok": false, "crashed", "error"}`。
2. worker 内异常分类：`OSError` / `access violation` → `crashed=true` 且回包后**自杀退出**（堆不可信，绝不再接下一个请求）；非原生异常 → 报错但继续服务。
3. 主进程崩溃检测：管道 EOF / 进程退出 / 30s 超时 → 丢弃 worker → **在全新 worker 中重试一次** → 仍失败则 502「音乐服务内部错误，请重试」。
4. 熔断：连续崩溃 ≥3 次 → 退避 30s，期间直接 502「音乐服务连续崩溃，请稍后重试」。
5. 重建 = 新 OS 进程 = 干净堆，不再触碰进程内重试/`ncm_init` 重建等危险路径。

对应改动：`app/core/ncm_worker.py`（新增）、`app/core/ncm_client.py`（重写为 RPC 客户端）；`ncm_call` 对外签名不变，服务层零改动。

### 复现备忘

```text
playlist_detail(563383913) 登录态调用偶发
  exception: access violation writing 0xFFFFFFFFFFFFFFF9（地址每次不同，含野生高位地址）
崩溃后同进程内继续调用 → 进程硬崩（无 traceback，uvicorn worker 直接消失）
直接以独立进程单次调用同一接口 → 正常返回（故响应解析/映射层无罪）
```


## 2026-06 · SDK 生命周期残留风险与隔离方案（记录，暂不实施 → 已实施，见上节）

### 现状约束

`backend/app/core/ncm_client.py` 当前策略：

- 禁止调用原生 `destroy()` / `destroy_context()`（会拆掉全局 QuickJS 上下文，之后 `ncm_init` 可能 `access violation reading 0x0`）。
- 异常时只把 Python 实例丢进 `_retired` 并重建，**故意泄漏**旧实例以避免二次 AV。
- 进程内单例 + 单线程 executor 串行化 SDK 调用。

### 残留风险

| 风险 | 影响 | 现缓解 |
|------|------|--------|
| `_retired` 无界增长 | 错误风暴下内存缓慢膨胀，无法回收原生上下文 | 重启进程 |
| 误 reset（非原生异常也走 `_reset_api`） | 不必要重建 + 加速泄漏 | 收窄异常匹配（待做） |
| 任一原生 AV 可能毒化全局上下文 | 后续请求全部失败，直到重启 | 进程重启 |
| `record/recent/song` 登录态崩溃 | 功能已搁置（见上节） | 不启用该路由 |

**接受现状的理由**：本地单人播放器，请求量低，重启成本可接受；继续在同进程内修补 destroy 边界收益有限。

### 推荐方案：子进程隔离 Worker（若将来要做）

把 MusicLibrary / QuickJS 整体挪进**独立子进程**，主进程只通过 RPC 调用 `ncm_call`：

```text
FastAPI 主进程
  └─ ncm_client (RPC client, asyncio)
       └─ pipe / unix socket
            └─ worker 子进程
                 └─ NeteaseCloudMusicApi + QuickJS + engine.dll
```

要点：

1. **崩溃边界**：worker 内 AV / segfault 只杀死子进程；主进程捕获后丢弃该次请求（映射 502），并自动拉起新 worker。
2. **泄漏回收**：worker 退出即释放全部原生上下文与 `_retired`，无需再「故意泄漏」；主进程内存不再随失败增长。
3. **可试验危险路由**：`record_recent_song` 等可在 worker 里调用；崩溃只废 worker，不拖垮 API 服务。若将来重启「最近播放」，优先在隔离 worker 里做登录态回归。
4. **协议**：请求 `{"fn": "song_url_v1", "cookie": {...}, "kwargs": {...}}`，响应 `{"ok": true, "status": 200, "body": ...}` / `{"ok": false, "error": "..."}`。cookie 不落盘，仅经管道传递。
5. **生命周期**：空闲超时或连续失败 N 次后主动回收 worker；启动时先 `ncm_init` 探活，失败则指数退避重启。
6. **线程模型**：worker 内仍保持单线程串行（SDK 非线程安全）；主进程可并发挂多个请求，由 RPC 层排队进 worker。

代价：

- IPC 序列化延迟（本地 pipe 可忽略）；
- 多一层进程管理与部署复杂度（Windows 下需处理 `engine.dll` / `ncm_music_api.dll` 加载路径）；
- 测试与调试链路变长。

### 决策

- **最近播放**：已确认放弃，不再投入。
- **隔离 worker**：作为上述残留风险的根治方案记录在案；当前阶段**维持同进程策略**，优先级低于功能与缓存串号等问题。触发升级的信号：生产运行中出现多次「必须重启才能恢复」的 AV，或需要重新试验带登录态的危险 SDK 路由。

### 附：若暂不隔离，最小加固项

1. `ncm_call` 仅在 `OSError` / `access violation` 时 `_reset_api`，其余异常原样抛出（减缓 `_retired` 增长）。
2. 给 `_retired` 加长度上限与告警日志，超限时提示「该重启了」。
3. 健康检查 `/api/health` 可选做一次轻量 SDK 探活，便于外部脚本自动重启。
