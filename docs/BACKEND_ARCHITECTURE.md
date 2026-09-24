# CsPlayer 后端架构

> FastAPI 应用 + MusicLibrary SDK（隔离在子进程 worker）。组织方式：目录职责 → 核心模块 → 横切关注点 → API 总表 → 去动落点 → 设计取舍。
> 相关文档：SDK 隔离排查史 `archived/DEBUG.md`；版本设计 `V0.1.6_DESIGN.md` 等；进展与问题记录 `V0.1.6_PROGRESS.md`。

## 1. 目录职责

```
                浏览器 (React 前端, :5173)
                       │  HTTP + Cookie(wyy_session)
                       ▼
app/main.py          应用装配：中间件栈（CORS → GZip → PerfLog）、异常处理、路由挂载
app/routers/         【接入层】HTTP ↔ 业务：参数解析、鉴权(Depends)、响应包装
app/services/        【业务层】上游编排、缓存、容错、数据整形（不碰 HTTP 对象）
app/core/            【基础设施】SDK 客户端/worker、会话、缓存、配置、错误、日志脱敏
app/models/          【契约层】Pydantic DTO（前端 types/index.ts 与之镜像）
                       │  ncm_call(...) → multiprocessing.Pipe RPC
                       ▼
        ncm_worker 子进程（唯一持有 SDK 原生库，可丢弃）→ 网易云 API
```

| 目录 / 文件 | 职责 | 备注 |
|---|---|---|
| `routers/auth.py` | 二维码登录 / me / logout / restore | 唯一会签发会话的地方 |
| `routers/song.py` | 用户资料库 + 歌曲（playlists/albums/likes/record/url/lyric/detail/like） | 历史合并了用户接口 |
| `routers/search.py` | 搜索 + 歌手只读页 | v0.1.3 |
| `routers/stream.py` | 音频流代理（StreamingResponse） | 不走 GZip |
| `routers/deps.py` | 依赖注入：`get_session` / 会话 Cookie 种/清 | |
| `routers/user.py` | 空壳占位 | 历史遗留 |
| `services/auth_service.py` | 扫码登录流程、Cookie 提取、restore/logout | |
| `services/library_service.py` | 歌单/专辑/喜欢/听歌排行（最大 service） | |
| `services/music_service.py` | 歌曲 URL、歌词解析、歌曲详情 | |
| `services/search_service.py` | 搜索、歌手详情/专辑 | |
| `services/mappers.py` | 上游脏 dict → DTO（防腐层） | 字段兼容集中地 |
| `core/ncm_client.py` + `core/ncm_worker.py` | SDK RPC 客户端 + 隔离子进程 | 见 §2 |
| `core/session.py` | 内存会话 + Cookie 解析工具 | |
| `core/cache.py` | 内存 TTL 缓存 | key 规约见 §3 |
| `core/config.py` | 超时 / TTL / CORS / Cookie 名（`settings` dataclass 单例） | |
| `core/errors.py` | 错误码 + 异常工厂 | 见 §3 |
| `core/logutil.py` | 日志脱敏（凭证只留在浏览器） | 见 §3 |

**依赖方向严格向下**：routers → services → core/models。routers 不碰 SDK，services 不碰 `Request`/`Response`/Cookie（HTTP 对象止步 routers 层），业务可脱离 HTTP 测试。

---

## 2. 核心模块介绍

### 2.1 `models/` — 数据契约

约定：**Brief 用于列表、Detail 用于详情**（Detail 内嵌 `tracks: list[SongSummary]`）；字段全部带默认值（`""`/`0`），上游缺字段不致构造失败。字段集 = 前端实际使用集（v0.1.6 裁剪：`AlbumBrief` 去 `publishTime/size`；`/api/user/likes` 不再下发冗余 `ids`，前端自 tracks 派生——见 `V0.1.6_DESIGN.md` §12.2）。

### 2.2 `core/ncm_client.py` + `core/ncm_worker.py` — SDK 子进程隔离

`pymusiclibrary`（QuickJS 绑定）两个致命特性：**非线程安全**；**原生崩溃毒化进程**（access violation 后堆已写坏，同进程任何原生调用都可能硬崩，try/except 拦不住）。故隔离边界必须是 OS 进程：

```
FastAPI 主进程（永不加载原生库）
  └─ ncm_client（RPC 客户端；单线程 executor + Lock 串行）
       └─ multiprocessing.Pipe（pickle；不走 stdio——SDK 原生层往 stdout 打噪声）
            └─ ncm_worker 子进程（唯一持有 SDK；单线程串行；随时可丢弃）
```

- **协议**：请求 `{"fn", "cookie", "kwargs"}` → 响应 `{"ok": true, "status", "headers", "body"}` 或 `{"ok": false, "crashed", "error"}`；主进程包回 `Response`，services 无感知，统一入口 `ncm_call(fn_name, cookie, **kwargs)`。
- **worker 内异常分类**：`OSError`/`access violation` → `crashed=true` 回包后**自杀退出**（堆不可信）；非原生异常 → 回错误继续服务。
- **主进程崩溃处理**（唯一重试边界）：管道 EOF / worker 退出 / 30s 超时 → 丢弃 worker → **在全新 worker 中重试一次** → 仍失败返回可读 502。
- **熔断**：连续崩溃 ≥3 次退避 30s，期间直接 502「音乐服务连续崩溃」。
- **worker stdout 脱敏**：worker 入口经 `logutil.install_worker_redaction()` 在 fd 层接管 stdout/stderr（见 §3.4）。

> 教训（不要再加回来）：monkey-patch `destroy()`、崩溃后同进程重试/重建实例——进程内缓解全部无效甚至有害（二次 `ncm_init` 必崩）。

### 2.3 `core/session.py` + `core/cache.py`

- **会话**：内存 `sid (token_urlsafe(24)) → {cookie, user_id, created_at}`，TTL 7 天。`wyy_session`（httponly）只是本地会话 id；会话值里的 `cookie` 是**上游网易云 Cookie dict**，请求时带给 SDK。`parse_cookie_str` / `merge_set_cookie` / `sanitize_cookie` 负责 Cookie 解析合并，统一按 `COOKIE_ATTRS` 剔除 `Max-Age/Expires/Path` 等属性键（历史上曾误存污染凭证）。
- **缓存**：`dict + threading.Lock + 过期时间戳`，get 惰性删除，`invalidate`/`invalidate_prefix` 主动失效。无持久化、无 LRU、重启即清。key 规约：

```
user:{user_id}:playlists / :playlists:raw / :likes / :liked_ids / :record:{type}:{limit}
user:{user_id}:liked_playlist          # 「我喜欢」歌单 id + trackCount hint（长 TTL）
user_profile:{凭证指纹 sha256 前 16 位（logutil.cred_fingerprint）}
playlist:{id}:detail / :tracks        album:{id}:detail
song:{id}:detail / :lyric / :url:{quality}
```

### 2.4 `core/logutil.py` — 日志脱敏

凭证合法位置仅两处：浏览器 localStorage、后端内存会话（零落盘）。审计发现 SDK **原生层直写 fd 1** 打印 `[ROUTE] ... cookie: {MUSIC_U: ...}`（绕过 logging 与 `sys.stdout`），统一出口 `redact()`（敏感键值 → `[REDACTED]`、URL query 抹除）三个覆盖点：

1. `RedactingFormatter` 包装 `csplayer.*` 与 `uvicorn.*` 全部 handler（含异常栈文本）；
2. worker 入口 **fd 层**接管 stdout/stderr（dup 真实 fd → 管道替换 fd 1/2 → 泵线程按行脱敏转发）；
3. `cred_fingerprint()`：内部标识用 sha256 指纹，不留明文凭证材料。

### 2.5 `services/auth_service.py` — 登录

扫码流程：`qr/key`（unikey 票据）→ `qr/create`（qrurl 本地 qrcode 渲染，SDK 的 qrimg 参数有 bug 不用）→ `qr/check`（前端轮询；800 过期 / 801 待扫 / 802 已扫 / 803 成功 → 提取 Cookie → 建会话 → 把 `{user, cred}` 下发浏览器保管）。`restore` 用浏览器凭证免扫码重建会话；`logout` 上游吊销 + 删会话 + 清缓存。

工程细节：unikey 缓存 25s + `asyncio.Lock` 合并并发 + 最小上游间隔 4s（防 StrictMode 双挂载触发 406 风控，`_ensure_not_busy` 统一译成 429）；Cookie 提取兼容三种形态（body `cookie` 字符串 / `Set-Cookie` 头 list / 逗号长串）。

### 2.6 `services/library_service.py` — 用户资料库

- `user_playlists`：拆「我创建 / 我收藏」，「我喜欢的音乐」置顶；与 `_liked_playlist` **共用 `_user_playlists_raw` 上游缓存**（减往返）。
- `_liked_playlist`：`specialType == 5` 或名字匹配识别「我喜欢的音乐」；pid 对账号不可变 → **长 TTL（24h）**；`trackCount` 仅作分页 hint（滞后由尾页兜底自校正），like 变更不失效该项。
- `_playlist_tracks`：分页每页 50、2000 条封顶（单页响应越小 SDK 大响应崩溃概率越低）；调用方给 `hint_total` 时**一次 gather 全部分页**，末页满页续拉兜底，缺 hint 退化串行。
- `user_albums`：服务端全量分页拉取（每页 50）后内存切片，返回 `{items, hasMore, total}`。
- `user_liked_ids`：likes 缓存命中时**直接派生**（单一数据源，省一次 likelist）。
- `user_likes` / `toggle_like`：喜欢列表；红心**双保险**（先 `like`，失败回退「我喜欢」歌单 `playlist_tracks` 增删），成功后 `_invalidate_like_cache` 精确失效（likes / liked_ids / playlists(+raw) / 该曲 detail / 该歌单 tracks+detail）——读己之写一致。
- `user_record_rank`：听歌排行（all/week）。**不是「最近播放」**（`record_recent_song` 带登录态原生崩溃，搁置，见 `archived/DEBUG.md`）。
- 容错：只读拉取走 `_ncm_get`（非 200 重试一次）；失败经 `_upstream_error` 译成用户可读错误（301 → 登录失效；其余 → 网易云接口暂时不可用），技术细节只进服务端日志。写操作不重试。

### 2.7 `services/music_service.py` / `search_service.py` / `mappers.py`

- `song_url`：`song_url_v1`（按 level 音质）→ 回退旧 `song_url(br)`；URL 短期有效，缓存 60s 带 `expireAt`。
- `get_lyric`：后端把 LRC 解析成结构化 `[{timeMs, text}]`（一行多时间戳、2/3 位毫秒都支持），翻译单列 `tlyric`，无时间戳降级 `hasTime=false`。
- `search`：type 分型 → cloudsearch 类型码（1/10/100/1000），统一 `{items, hasMore, total}`；优先 `request("/cloudsearch")`（字段全），失败回退 `search()`；单曲按 `privilege` 标不可播。限流：滑动窗口 30 次/分（过短关键字 6 次），超限 429。
- `artist_detail` / `artist_albums`：歌手头部 + 热门 50 首；专辑分页（`total` 取 `albumSize`）。
- `mappers`：上游新旧字段并存（`al`/`album`、`ar`、`dt`）在此兼容，**加字段/接口改动集中地**。

---

## 3. 横切关注点

### 3.1 鉴权与凭证边界

- 无 `Depends(get_session)` 的接口仅：`/api/auth/qr/*`、`/api/auth/restore`、`/api/health`。
- **凭证边界**：网易云凭证只存在于浏览器 localStorage（多账号凭证库）与后端**内存**会话，服务端零落盘；后端重启 = 会话清空，前端用浏览器凭证调 `restore` 静默重建，用户无感。
- `wyy_session` Cookie：`httponly`（防 XSS 偷取）+ `samesite=lax`（缓解 CSRF）。

### 3.2 错误处理

```
业务层 raise not_found / unauthorized / bad_request / bad_gateway / rate_limited
  （HTTPException，detail = {"code": 业务码, "message": 中文提示}）
      ↓ main.py 异常处理器
统一响应 {"code", "message", "data"}：成功 code=0（models/common.py::ok）；
未处理异常兜底 500 {"code": 5000}（不泄漏堆栈，服务端日志留证）
```

| HTTP | 业务 code | 含义 |
|---|---|---|
| 401 | 1001 | 未登录 / 会话失效 |
| 400 | 1002 | 参数错误 |
| 404 | 2001 | 资源不存在 |
| 429 | 4290 | 操作频繁（限流） |
| 502 | 5001 | 上游/SDK 失败 |
| 500 | 5000 | 服务器内部错误 |

文案约定：`message` 是给用户看的中文短句（前端直接展示 + 重试）；status/`body.code`/堆栈只进服务端日志。

### 3.3 缓存一致性

| 数据 | TTL | 失效时机 |
|---|---|---|
| 用户资料 | 300s | logout 按前缀清 |
| 歌单列表 / raw / 喜欢 / liked_ids / 收藏专辑 | 60s | `toggle_like` 精确失效 |
| 「我喜欢」歌单 id+hint | 24h | 不失效（pid 不可变，hint 自校正） |
| 歌单详情 / tracks | 120s | 同上（喜欢歌单 tracks） |
| 专辑详情 / 歌手详情 / 歌曲详情 | 300s | 自然过期 |
| 搜索结果 | 60s | 自然过期（key 含 kw+type+page） |
| 歌曲 URL | 60s | 自然过期（上游短期有效） |
| 歌词 | 3600s | 自然过期 |

规律：只读数据长 TTL；被「喜欢/收藏」改的短 TTL + 主动失效钩子（保证红心读己之写）。

### 3.4 日志与脱敏

`csplayer.*` / `uvicorn.*` 全部 handler 输出经 `RedactingFormatter`（含异常栈）；SDK worker 的 stdout/stderr 在 **fd 层**接管、按行脱敏转发（原生层直写 fd 是真实泄漏源）；`perf` 计时日志同通道输出。规则细节见 §2.4 与 `core/logutil.py`。

### 3.5 性能度量

`PerfLogMiddleware` 对全部 `/api/*` 输出：`perf <method> <path> <status> <ms> <KB> upstream=<n>次 <ms>`——`KB` 为压缩后实际写出字节，`upstream` 为该请求内 SDK 调用次数/累计耗时（contextvar 按请求归因），一眼区分「上游 / 串行 / 体积」瓶颈。

### 3.6 传输优化

- GZip 中间件：阈值 1KB，**排除 `/api/stream/*`**（音频流禁二次压缩）。
- `/song/{id}/url` 不回传上游带签名 CDN 地址，改写为内部 `/api/stream/{id}?level=...` 代理路径；stream 转发透传 `Range`（支持拖进度条 206）、64KB 分块流式、剔除 hop-by-hop 头、`finally` 保证上游连接关闭。

### 3.7 并发模型

uvicorn 事件循环 + 全 `async def`。唯一同步阻塞点（SDK）压进 `max_workers=1` 线程池串行、再经 Pipe 串行进 worker——**吞吐刻意换稳定性**（SDK 非线程安全）。双锁：`threading.Lock`（线程安全）、`asyncio.Lock`（合并重复上游请求）。单进程部署（内存会话/缓存不跨进程）。

---

## 4. API 总表

| 方法 | 路径 | 登录 | 说明 | 文件 |
|---|---|---|---|---|
| GET | `/api/health` | ✗ | 健康检查 | main.py |
| POST | `/api/auth/qr/key` | ✗ | 二维码 unikey（复用 + 限速） | auth.py |
| POST | `/api/auth/qr/create` | ✗ | 二维码图（本地渲染） | auth.py |
| POST | `/api/auth/qr/check` | ✗ | 轮询登录状态；成功返回 `{user, cred}` | auth.py |
| POST | `/api/auth/restore` | ✗ | 浏览器凭证免扫码重建会话 | auth.py |
| GET | `/api/auth/me` | ✓ | 用户资料（缓存 300s） | auth.py |
| POST | `/api/auth/logout` | ✓ | 上游吊销 + 删会话 + 清缓存 | auth.py |
| GET | `/api/user/playlists` | ✓ | 我创建 / 我收藏的歌单 | song.py |
| GET | `/api/user/albums?offset&limit` | ✓ | 收藏专辑（内存切片分页） | song.py |
| GET | `/api/user/likes` | ✓ | 喜欢列表（不含冗余 ids） | song.py |
| GET | `/api/user/liked-ids` | ✓ | 喜欢 id 集（可自 likes 派生） | song.py |
| GET | `/api/user/record?type=all\|week&limit` | ✓ | 听歌排行 | song.py |
| GET | `/api/playlist/{id}` | ✓ | 歌单详情（含曲目） | song.py |
| GET | `/api/album/{id}` | ✓ | 专辑详情（含曲目） | song.py |
| GET | `/api/song/{id}/url?level` | ✓ | 播放地址（改写为内部代理路径） | song.py |
| GET | `/api/song/{id}/lyric` | ✓ | 结构化歌词 | song.py |
| GET | `/api/song/{id}/detail` | ✓ | 歌曲详情 | song.py |
| POST | `/api/song/{id}/like` `{like}` | ✓ | 收藏 / 取消 | song.py |
| GET | `/api/search?kw&type&limit&offset` | ✓ | 搜索（song/album/artist/playlist） | search.py |
| GET | `/api/artist/{id}` | ✓ | 歌手详情 + 热门歌曲 | search.py |
| GET | `/api/artist/{id}/albums?offset&limit` | ✓ | 歌手专辑分页 | search.py |
| GET | `/api/stream/{id}?level` | ✓ | 音频流代理（流式，无 GZip） | stream.py |

启动：`cd backend && python -m uvicorn app.main:app --reload --port 8000`；交互式文档 `http://localhost:8000/docs`。

---

## 5. 改动落点（常见需求 → 代码位置）

| 想做的事 | 落点 |
|---|---|
| 加一个新接口 | `models/` 定 DTO → `services/` 写业务（`ncm_call` + `cache`）→ `routers/` 加路由（需要登录加 `Depends(get_session)`） |
| 接入新的网易云接口 | `services/` 里 `ncm_call("方法名", cookie=..., **参数)`，`resp.body` 用 `mappers.py` 转 DTO |
| 加 / 改返回字段 | `models/` + `mappers.py`（上游新旧字段兼容都在这）+ 前端 `types/index.ts` 显式适配；**批量响应先做字段裁剪评估** |
| 调缓存时长 / 加缓存 key | `core/config.py::cache_ttl` + 对应 service（写路径记得加失效钩子） |
| 红心 / 收藏类写操作 | `library_service.toggle_like` 模式：写后 `_invalidate_like_cache` 精确失效，保读己之写 |
| 分页拉取行为 | `library_service._playlist_tracks`（hint + gather + 尾页兜底）、`user_albums` |
| 改登录方式（手机号等） | `services/auth_service.py` + `routers/auth.py`，会话层不动 |
| 新增日志 / 担心泄漏 | 走 `logging.getLogger("csplayer.*")` 即自动脱敏；新敏感键加进 `core/logutil.py::_SECRET_KEY`；SDK 噪声已被 fd 层覆盖 |
| 性能排查 | 看 perf 日志的 `upstream` 占比（上游/串行）与 `KB`（体积）；结论回填设计文档 |
| SDK 崩溃 / access violation | worker 已隔离自动重启，前端「重试」即可；排查体例 `archived/DEBUG.md`。**禁止**进程内重试 / 重建实例 / 调 `destroy()` |
| 持久化会话 / 缓存 | 只替换 `core/session.py` / `core/cache.py` 内部实现（接口不变） |

---

## 6. 设计取舍

| 取舍 | 选择 | 理由 / 代价 |
|---|---|---|
| SDK 隔离 | OS 子进程（可丢弃 worker） | 原生崩溃毒化进程，进程内无解；代价：Pipe RPC 开销 + worker 冷启动 1~2s |
| SDK 并发 | 单线程串行 | 非线程安全；代价：吞吐受限、上游往返不可并行（性能优化因此走「减往返」而非并发，见 `V0.1.6_DESIGN.md` §12.1） |
| 会话 / 缓存 | 全内存 | 零落盘、实现最小；代价：重启掉线（浏览器凭证 `restore` 自愈）、多进程不共享（故单进程部署） |
| 凭证保管 | 浏览器 localStorage + 后端内存 | 免扫码 + 零落盘；代价：凭据在浏览器侧可见（用户可控、可移除），信任域限 localhost |
| 日志脱敏 | fd 层接管 + formatter 兜底 | 原生层直写 fd 绕过一切 Python 包装；代价：worker 内两个泵线程 |
| 上游 URL | 改写为内部流代理 | 不向浏览器泄漏带签名 CDN 地址；代价：音频流量过一遍后端 |
| GZip | 全局开、流式关 | likes 级 JSON 压缩收益大（~3.7x）；音频流二次压缩有害 |
| `user_albums` | 服务端全量拉取后切片 | 拿到准确 total、省接口往返；代价：收藏多时首次加载慢（TTL 60s + 前端 SWR 缓解） |
| 扫码 unikey | 复用 + 25s 缓存 + 4s 最小间隔 | 防 StrictMode 双挂载触发上游 406 风控 |
| 「最近播放」 | 搁置 | 上游接口带登录态原生崩溃（`archived/DEBUG.md`），前端改本地记录（v0.1.6 S3-2） |
| 二维码渲染 | 本地 qrcode 库 | SDK 的 `qrimg` 参数有 bug（route did not finish） |
| CSRF | 无 token，靠 `SameSite=Lax` | 本地单机工具够用；CORS 白名单写死在 `config.py` |
