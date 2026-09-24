# CsPlayer 后端架构讲解（面向熟悉 Python、不熟悉 FastAPI 的读者）

> 本文只讲 **backend/** 目录。目标：让你读完后能看懂任何一个后端文件、知道改一个需求该动哪里、以及明白每段"看起来奇怪"的代码为什么这么写。
>
> 代码规模：约 1500 行，分 4 层（`routers → services → core → models`）。
> 技术栈：FastAPI + uvicorn（HTTP 服务）+ Pydantic（数据模型）+ httpx（异步 HTTP 客户端）+ pymusiclibrary（网易云 SDK）+ qrcode（本地渲染二维码）。

---

## 0. 先补 FastAPI 的 5 个核心概念（5 分钟）

如果你没写过 FastAPI，下面这些是理解全部代码的最小知识集。**用 Flask/Django 的心智来对照会更快。**

### 0.1 路由函数 = "装饰器 + async def"

```python
@app.get("/api/health")        # 装饰器声明：GET /api/health 时调用下面的函数
async def health():            # async def = 协程，FastAPI 会放进事件循环调度
    return {"code": 0, "message": "ok", "data": {"status": "up"}}
```

- 函数的**返回值**会被自动序列化成 JSON（Pydantic 模型或 dict 都行）。
- `async def` 与 `def` 都可以：`async def` 在事件循环里跑（不能有阻塞 IO）；普通 `def` 会被丢进线程池跑。本项目**全部用 `async def`**，所有真正的阻塞调用（网易云 SDK）都手动丢线程池并转发到子进程 worker（见 §3.2）。

### 0.2 路径参数 / 查询参数 / 请求体 = "函数签名即文档"

FastAPI 根据**函数参数的类型注解**自动解析和校验请求。这是它跟 Flask 最大的不同——不用手写 `request.args.get(...)`。

```python
# /api/album/123  → playlist_id=123（路径参数，类型自动转 int）
@router.get("/album/{album_id}")
async def album_detail(album_id: int, ...)

# /api/user/albums?offset=0&limit=20 → 查询参数，带校验
@router.get("/user/albums")
async def user_albums(
    offset: int = Query(default=0, ge=0),                 # ge = greater equal，>=0
    limit: int | None = Query(default=None, ge=1, le=200),# 1 ≤ limit ≤ 200，可为空
    ...
)
```

`Query(...)` / `Body(...)` / `Cookie(...)` 是"参数来源声明 + 校验规则"。不满足约束（比如 `offset=-1`）FastAPI 会直接返回 422，不用自己写判断。
`Body(default={})` 表示从 JSON 请求体取值。`body: dict` 这种裸 dict 则表示"整个 JSON 体原样给我"（`routers/auth.py` 里就是这么拿 `{unikey: ...}` 的）。

### 0.3 依赖注入 = `Depends(...)`（本项目的鉴权核心）

`Depends(f)` 的意思是"调用我之前先执行 `f`，把它的返回值塞进这个参数"。类比 Python 里的 `functools.cache + 自动调用`，但 FastAPI 会解析 `f` 自己的参数（层层递归）并缓存同一次请求内的结果。

本项目唯一的依赖就是 `routers/deps.py::get_session`：

```python
@router.get("/user/playlists")
async def user_playlists(session: dict = Depends(get_session)) -> ApiResponse:
    ...
```

只要写了 `Depends(get_session)`，未登录的请求会在**进入函数体之前**就被 401 拦掉。相当于 Flask 里的 `@login_required` 装饰器，但更灵活（返回值还能往下传）。

### 0.4 `APIRouter` = 一组路由的集合，最后"挂"到 app 上

`app/main.py`：

```python
app.include_router(auth_router.router, prefix="/api/auth")  # /api/auth/qr/key ...
app.include_router(song_router.router, prefix="/api")       # /api/user/playlists ...
app.include_router(stream_router.router, prefix="/api")     # /api/stream/{id}
```

好处：每个文件只写自己那组接口，路径前缀在装配时统一加，方便测试和拆分。

### 0.5 中间件与异常处理器

- **中间件**（`add_middleware`）：洋葱模型，每个请求/响应都会穿过。这里只用了 `CORSMiddleware` 处理跨域（前端跑在 5173 端口，后端 8000，浏览器会拦）。
- **异常处理器**（`@app.exception_handler(HTTPException)`）：全局兜底。路由里 `raise not_found(...)` 之类，最后都会被 `main.py` 的 handler 抓住，转成统一的 `{code, message, data}` JSON 格式。业务代码只管抛异常，不用每处手写错误响应。

### 0.6 顺带：Pydantic `BaseModel`

就是**带类型校验的 dataclass**。`SongSummary(id=..., name=...)` 构造时会检查/转换类型；`model_dump()` 转回 dict（相当于 dataclass 的 `asdict`）。`models/` 目录全是它，用作接口的输入输出契约（= 自动文档里的 schema）。

---

## 1. 全景：分层架构与目录职责

```
                浏览器 (React 前端, :5173)
                       │  HTTP + Cookie(wyy_session)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ app/main.py          FastAPI 应用装配：CORS、异常处理、路由挂载 │
├──────────────────────────────────────────────────────────────┤
│ app/routers/         【接入层】HTTP ↔ 业务，参数解析、鉴权、响应包装 │
│   auth.py            二维码登录 / me / logout                  │
│   song.py            歌单、专辑、歌曲 URL/歌词/详情、喜欢、听歌记录 │
│   stream.py          音频流代理（StreamingResponse）            │
│   deps.py            依赖注入：会话读取、Cookie 设置/清除         │
│   user.py            空文件（历史遗留，接口合并进 song.py）       │
├──────────────────────────────────────────────────────────────┤
│ app/services/        【业务层】编排、缓存、容错、数据整形          │
│   auth_service.py    二维码登录流程 + Cookie 提取               │
│   library_service.py 用户歌单/专辑/喜欢/听歌记录                │
│   music_service.py   歌曲 URL、歌词解析、歌曲详情               │
│   mappers.py         上游脏数据 dict → Pydantic 模型（防腐层）   │
├──────────────────────────────────────────────────────────────┤
│ app/core/            【基础设施】与业务无关的通用能力             │
│   ncm_client.py      SDK RPC 客户端：worker 管理/崩溃检测/重试   │
│   ncm_worker.py      SDK 隔离子进程（唯一持有原生库，可丢弃）     │
│   session.py         内存版会话存储 + Cookie 解析工具            │
│   cache.py           内存版 TTL 缓存                           │
│   config.py          全局配置（dataclass Settings 单例）        │
│   errors.py          错误码 + 快捷异常工厂                      │
├──────────────────────────────────────────────────────────────┤
│ app/models/          【契约层】Pydantic DTO                    │
│   song/album/playlist/user/common(ApiResponse)               │
└──────────────────────────────────────────────────────────────┘
                       │  ncm_call(...) → multiprocessing.Pipe RPC
                       ▼
        ncm_worker 子进程（可丢弃）：pymusiclibrary SDK
        （QuickJS 原生绑定，非线程安全，原生崩溃会毒化进程——故隔离在此）
                       │  HTTPS
                       ▼
                 网易云音乐 API
```

**依赖方向严格向下**：routers → services → core/models。routers 不碰 SDK，services 不碰 HTTP 对象（`Request`/`Response`/Cookie 都止步于 routers 层）。这样业务可以脱离 HTTP 测试。

---

## 2. 一个请求的完整生命周期（以 `GET /api/user/playlists` 为例）

```
1. 浏览器 fetch('/api/user/playlists', {credentials:'include'})
        ↓ 携带 Cookie: wyy_session=<sid>
2. CORS 中间件放行（origin 在 settings.cors_origins 白名单）
3. 路由匹配 song.py::user_playlists
        ↓ 发现参数 session=Depends(get_session)
4. deps.get_session 先执行：
   - 从 Cookie 里按别名 settings.cookie_name 取出 sid（Cookie(...) 参数）
   - sessions.get(sid) 查内存会话表：不存在/过期 → raise HTTPException(401)
   - 返回 {"sid", "cookie": {MUSIC_U:...}, "user_id"}
        ↓
5. 进入函数体：library_service.user_playlists(cookie, user_id)
   - 先查 TTL 缓存 key="user:{user_id}:playlists"，命中直接返回
   - 未命中 → ncm_call("user_playlist", ...) （见 §3.2，经 Pipe RPC 进子进程 worker 串行执行）
   - mappers.map_playlist_brief 把上游脏 dict 转 PlaylistBrief
   - 拆成 created / subscribed 两组，"我喜欢的音乐"置顶
   - 写缓存（TTL 60s，来自 settings.cache_ttl）
        ↓
6. 返回 dict → ok(data) 包装成 ApiResponse(code=0, message="ok", data=...)
        ↓ 自动序列化为 JSON
7. 若中途任何一步 raise HTTPException → main.py 的异常处理器
   统一转成 {"code": xxx, "message": "...", "data": null}
```

---

## 3. 各层逐文件精讲

### 3.1 `app/models/` — 数据契约（最简单，先看这个热身）

| 文件 | 内容 |
|---|---|
| `common.py` | `ApiResponse{code, message, data}` 统一响应壳；`ok()` 是快捷构造器 |
| `song.py` | `SongSummary/SongUrl/Lyric/LyricLine/LikedSongs/LikeResult/RecordItem` |
| `album.py` | `AlbumBrief`（列表项）/`AlbumDetail`（含 tracks） |
| `playlist.py` | `PlaylistBrief`/`PlaylistDetail` |
| `user.py` | `UserProfile` |

设计习惯：**Brief 用于列表、Detail 用于详情**（Detail 内嵌 `tracks: list[SongSummary]`）。字段给了默认值（`= ""`、`= 0`），所以上游缺字段也不会构造失败——这是对抗网易云不规范返回的第一道防线。

注意一个坑：`tracks: list[SongSummary] = []` 这种**可变默认值**写在 Pydantic 模型里是安全的（Pydantic 会为每个实例复制一份），但如果你在普通函数/类里这么写就是经典 bug。

### 3.2 `app/core/` — 基础设施

#### `config.py` — 全局配置

不是 pydantic-settings，就是一个普通 `@dataclass Settings`，模块级实例 `settings = Settings()` 当单例用。所有超时、TTL、CORS 白名单、Cookie 名都集中在这。改配置只动这一个文件。

#### `errors.py` — 错误码体系

```python
def not_found(message="资源不存在") -> HTTPException:
    return HTTPException(status_code=404, detail={"code": 2001, "message": message})
```

注意这些是**返回异常对象**的工厂函数，业务代码写 `raise not_found(...)`。`detail` 传 dict 而非字符串，`main.py` 的异常处理器才能还原出业务错误码（HTTP 状态码 vs 业务 code 分开表达：401/1001 未登录、404/2001 不存在、502/5001 上游失败、429/4290 频繁）。

#### `cache.py` — 进程内 TTL 缓存

30 行的 `dict + threading.Lock + 过期时间戳`。`get` 时惰性删除过期项，`invalidate_prefix` 按 key 前缀批量失效（比如 logout 时清掉该用户所有缓存）。
**没有持久化、没有 LRU 上限、重启即清空**——对本地单用户播放器足够。key 的命名规约很重要：

```
user:{user_id}:playlists / :likes / :liked_ids / :record:{type}:{limit}
user:{user_id}:liked_playlist_id
user_profile:{MUSIC_U前24位}
playlist:{id}:detail / :tracks        album:{id}:detail
song:{id}:detail / :lyric / :url:{quality}
```

#### `session.py` — 会话（登录态）

同样是内存实现：`sid (secrets.token_urlsafe(24)) → {cookie, user_id, created_at}`，TTL 7 天。

关键点：**服务端保存的是网易云的 Cookie 字符串解析成的 dict**（`{"MUSIC_U": "..."}`），请求上游时把它带给 SDK。也就是说 `wyy_session` 这个 httpOnly Cookie 只是**本地会话 id**。v0.1.4 起，`qr/check` 成功与 `restore` 会把网易云凭据（`cred`）一并下发给浏览器保管（localStorage，v0.1.5 为多账号凭证库），用于后端重启后免扫码重建会话——服务端仍**零落盘**，内存会话里的凭据随进程生命周期消失；信任域权衡见 `docs/archived/V0.1.5_DESIGN.md` §3.1/§6。

另外两个工具函数：`parse_cookie_str`（`"a=1; b=2"` → dict）和 `merge_set_cookie`（把上游 `Set-Cookie` 合并进现有 cookie，处理刷新登录态）。**注意**：解析时会按 `COOKIE_ATTRS` 过滤 `Max-Age/Expires/Path` 等 Set-Cookie 属性——上游 cookie 字符串里混着它们，不能当成 cookie 收进来（历史上曾把 `Path=/wapi/feedback` 之类存进会话污染凭据）。

已实现（v0.1.4）：凭据改存浏览器 localStorage + `/api/auth/restore` 用凭据重建会话（解决后端重启需重新扫码的问题，后端零落盘）；v0.1.5 升级为前端多账号凭证库（切换账号免扫码），后端契约不变。

#### `ncm_client.py` + `ncm_worker.py` — 网易云 SDK 子进程隔离（全项目最硬核的部分）

背景：`pymusiclibrary` 是 QuickJS 的 Python 绑定，调用网易云 API 的 JS 实现。它有两个致命特性：**非线程安全**；**原生崩溃会毒化进程**——access violation 是野生内存写，ctypes 把它包成 OSError 抛出时堆已经写坏，此后同一进程内任何原生调用（重试、重建实例、二次 `ncm_init`）都可能直接把 Python 进程带崩，try/except 拦不住（完整实锤见 `docs/archived/DEBUG.md`）。

结论：**进程内无解，隔离边界必须是 OS 进程**。因此 SDK 只活在可丢弃的子进程 worker 里：

```
FastAPI 主进程（永不加载原生库）
  └─ ncm_client（RPC 客户端；单线程 executor + Lock 串行）
       └─ multiprocessing.Pipe（二进制 pickle；不走 stdio——SDK 会往 stdout 打噪声）
            └─ ncm_worker 子进程（唯一持有 SDK/QuickJS；单线程串行；随时可丢弃）
```

- **协议**：请求 `{"fn", "cookie", "kwargs"}` → 响应 `{"ok": true, "status", "headers", "body"}` 或 `{"ok": false, "crashed", "error"}`；主进程包回 `MusicLibrary.common.Response`，services 层无感知。
- **worker 内异常分类**（`ncm_worker.main`）：`OSError`/`access violation` → `crashed=true` 回包后**自杀退出**（堆不可信，绝不再接下一个请求）；非原生异常 → 回错误但继续服务。
- **主进程崩溃处理**（`ncm_client._call_serial`）：管道 EOF / worker 退出 / 30s 超时 → 丢弃 worker → **在全新 worker（干净堆）中重试一次** → 仍失败返回 502「音乐服务内部错误，请重试」。这是全项目唯一的重试边界。
- **熔断**：连续崩溃 ≥3 次 → 退避 30s，期间直接 502「音乐服务连续崩溃，请稍后重试」，防崩溃风暴。
- **不变的部分**：统一入口仍是 `ncm_call(fn_name, cookie, **kwargs)`，services 只按名字调用（`"user_playlist"`、`"song_url_v1"`…），签名不变。

> 历史教训（代码已删，**不要再加回来**）：monkey-patch `destroy()`、崩溃后"故意泄漏"重建实例、崩溃后同进程重试——这些进程内缓解全部无效甚至有害（重建=二次 `ncm_init`=必崩；同实例重试=在坏堆上跑原生代码=硬崩）。

### 3.3 `app/services/` — 业务层

#### `auth_service.py` — 二维码登录

流程（对应前端 `useQrLogin` 的轮询）：

```
POST /api/auth/qr/key    → 上游 login_qr_key 拿 unikey（一次性票据）
POST /api/auth/qr/create → 上游 login_qr_create 拿 qrurl，本地 qrcode 库渲染成
                            base64 PNG（SDK 的 qrimg 参数有 bug，不用）
POST /api/auth/qr/check  → 前端每 ~2s 轮询一次，上游返回码：
                            800 过期 / 801 待扫描 / 802 已扫待确认 / 803 成功
                            成功 → 提取 Cookie → 拉 user_account 建会话 → 种下
                                   httpOnly Cookie(wyy_session)，并把 {user, cred}
                                   下发给浏览器（凭证入库，v0.1.4+）
GET  /api/auth/me        → 用户资料（带 5 分钟缓存）
POST /api/auth/restore   → 用浏览器保存的凭证重建会话（v0.1.4；免扫码，登录成功
                            后切换/冷启动自动恢复共用同一入口，返回 {user}）
POST /api/auth/logout    → 上游登出（吊销凭证）+ 本地删会话 + 清缓存 + 清 Cookie
                            （v0.1.5 语义：彻底退出当前账号，其余已保存账号不动）
```

两个值得学习的工程细节：

- **unikey 复用 + 最小上游间隔（4s）**：React StrictMode 双挂载会在瞬间发两次 qr/key，撞上网易云 406 风控。所以 `_qr_cached` 缓存 unikey 25s、`_qr_io_lock`（`asyncio.Lock`，并发请求合并成一次上游调用）、`_QR_KEY_MIN_INTERVAL` 强制限速。`_ensure_not_busy` 把上游 406/「频繁」统一翻译成 429。
- **Cookie 提取要兼容三种形态**：body 里的 `cookie` 字符串、`Set-Cookie` 响应头（可能是 list 或逗号拼接的长串），全在 `_extract_cookies` 里手工解析，并同样按 `COOKIE_ATTRS` 过滤 `Max-Age/Expires/Path` 等属性键（见 `core/session.py`）。

#### `library_service.py` — 用户资料库（最大的 service）

- `user_playlists`：拉歌单列表，按 `subscribed`/creator 是否本人拆成"我创建的/我收藏的"，含"我喜欢的音乐"置顶逻辑。
- `user_albums`：**服务端分页全量拉取**——循环调 `album_sublist`（每页 50）直到不足一页或超过 500 条，全部缓存后在内存里做 offset/limit 切片，返回 `{items, hasMore, total}`。省一次上游接口来回，代价是首次加载慢（TTL 60s）。
- `playlist_detail` + `_playlist_tracks`：元信息和曲目分开取（曲目分页每页 50、拉到 2000 条封顶——单页响应越小，SDK 大响应崩溃概率越低），两者分别缓存（tracks 也会被"喜欢"变更单独失效）。
- `liked_playlist_id`：识别"我喜欢的音乐"歌单——`specialType == 5` 或名字匹配 `我喜欢的音乐`。
- `user_liked_ids` / `user_likes`：已喜欢的歌曲 id 集合（用于列表心形图标）和完整列表。
- `toggle_like`：**双保险**——先调 `like` 接口；失败回退到对"我喜欢的音乐"歌单 `playlist_tracks(op=add/del)` 增删曲。成功后调 `_invalidate_like_cache` 精确失效相关缓存（likes、liked_ids、playlists、该曲 detail、该歌单 tracks/detail）。
- `user_record_rank`：听歌排行（all/week）。注意 docstring 说明：**这不是"最近播放"**，真正的最近播放接口 `record_recent_song` 带登录态会触发原生崩溃，已搁置（详见 `docs/archived/DEBUG.md`）。
- **容错约定**（本层所有只读 SDK 拉取走 `_ncm_get`）：上游偶发非 200 自动重试一次；最终失败经 `_upstream_error` 翻译成用户可读错误（301→"登录已失效"，其余→"网易云接口暂时不可用（错误码 xxx）"），status/`body.code` 等技术细节只进服务端日志。写操作（`like`/`playlist_tracks`）不重试，避免重复执行。

#### `music_service.py` — 播放相关

- `song_url`：先试 `song_url_v1`（按音质 `level` 请求：standard/higher/exhigh/lossless/hires/...），拿不到再回退旧 `song_url(br=码率)`。URL 有有效期，缓存 TTL 60s 并附 `expireAt`。
- `get_lyric` + `parse_lrc_text`：**在后端就把 LRC 文本解析成结构化 `[{timeMs, text}]`**（支持一行多时间戳 `[00:10.00][01:20.00]副歌`、2/3 位小数毫秒），翻译歌词 `tlyric` 单独一列，前端只需按时间对齐渲染。无时间戳歌词降级为 `hasTime=False` 的纯文本行。
- `song_detail`：单曲详情（缓存 300s）。

#### `search_service.py` — 搜索 + 歌手只读页（v0.1.3）

- `search`：统一搜索入口，`type` 分型（song/album/artist/playlist）→ cloudsearch 类型码（1/10/100/1000），响应统一 `{items, hasMore, total}`。优先走 SDK 通用 `request("/cloudsearch")`（比 `/search` 字段全：带封面、privilege），失败自动回退 SDK `search()`，两者响应结构 mappers 通吃。单曲额外按 `privilege` 标记不可播（无版权）。
- **限流**：进程内滑动窗口（每用户每分钟 30 次；关键字 < 2 字视为“过短”，降到 6 次），超限返回 429 `rate_limited`，避免高频搜索触发上游风控。关键字空 / 超 60 字 / 类型非法 → 400 参数错误（与“无结果”明确区分）。
- `artist_detail`：歌手只读页头部数据，`artists` 接口取歌手信息 + 热门 50 首；上游 404 映射为“歌手不存在”。
- `artist_albums`：歌手专辑分页（`{items, hasMore, total}`，歌手页每页 30 张 + 「加载更多」），`total` 取 `artist.albumSize`、`hasMore` 取上游 `more`；按页缓存。
- 缓存：搜索 60s（key 含 `kw+type+page`），歌手 300s。

#### `mappers.py` — 防腐层

上游返回的字段又乱又不统一（`al`/`album`、`ar`/`artists`、`dt`/`duration` 新旧字段并存），全部在 mapper 里做兼容转换，业务代码只见到干净的 DTO。**加新字段/新接口时改动都集中在这里。**

### 3.4 `app/routers/` — 接口层

薄到只做四件事：**解析参数 → 鉴权（Depends）→ 调 service → 包 `ok(...)`**。

#### `deps.py` — 依赖注入三件套

```python
get_session        # 依赖：Cookie → sid → 会话校验 → {sid, cookie, user_id}，失败 401
set_session_cookie   # 登录成功后种 httponly + samesite=lax 的会话 Cookie
clear_session_cookie # 登出清 Cookie
```

`httponly` = JS 读不到（防 XSS 偷 cookie）；`samesite=lax` = 跨站请求不带（防 CSRF）。

#### `song.py` — 接口一览（全部需要登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/user/playlists` | 我创建/收藏的歌单 |
| GET | `/api/user/albums?offset&limit` | 收藏专辑（分页） |
| GET | `/api/playlist/{id}` | 歌单详情（含曲目） |
| GET | `/api/album/{id}` | 专辑详情（含曲目） |
| GET | `/api/song/{id}/url?level=` | 播放地址（**改写为内部代理路径**，见下） |
| GET | `/api/song/{id}/lyric` | 结构化歌词 |
| GET | `/api/song/{id}/detail` | 歌曲详情 |
| GET | `/api/user/likes` · `/user/liked-ids` | 喜欢列表 / 喜欢 id 集 |
| POST | `/api/song/{id}/like` body `{like: bool}` | 收藏/取消 |
| GET | `/api/user/record?type=all\|week&limit=` | 听歌排行 |

**一个安全设计**：`/song/{id}/url` 不把网易云的真实 CDN 地址返回浏览器（避免泄漏带签名的上游 URL），而是改写成 `"/api/stream/{id}?level=..."`，让音频走自己的代理。

#### `search.py` — 搜索与歌手（需要登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/search?kw&type&limit&offset` | 综合搜索，type=song/album/artist/playlist |
| GET | `/api/artist/{id}` | 歌手详情（信息 + 热门歌曲） |
| GET | `/api/artist/{id}/albums?offset&limit` | 歌手专辑分页 |

#### `stream.py` — 音频流代理（流式转发）

```
浏览器 <audio src="/api/stream/123?level=lossless">
   → 后端重新解析 song_url → httpx.AsyncClient(stream=True) 请求上游
   → 透传 Range 头（浏览器拖进度条靠它，返回 206 Partial Content）
   → 64KB 分块 async for 转发（StreamingResponse，不会把整首歌读进内存）
   → 剔除 transfer-encoding / connection / content-encoding 三个 hop-by-hop 头
   → body_iter 的 finally 里保证上游连接一定被关闭（客户端断开也不会泄漏）
```

`StreamingResponse` + async generator 是 FastAPI 处理大文件的标准姿势。

---

## 4. 横切关注点：缓存 / 鉴权 / 并发 / 错误处理速查

### 缓存策略（`settings.cache_ttl`）

| 数据 | TTL | 失效时机 |
|---|---|---|
| 用户资料 | 300s | logout 按前缀清 |
| 歌单列表/喜欢列表/liked_ids/收藏专辑 | 60s | `toggle_like` 时精确失效 |
| 歌单详情/tracks | 120s | 同上（喜欢歌单的 tracks） |
| 专辑详情 | 300s | 自然过期 |
| 搜索结果 | 60s | 自然过期（key 含 kw+type+page） |
| 歌手详情 | 300s | 自然过期 |
| 歌曲 URL | 60s | 自然过期（上游本身短期有效） |
| 歌词 | 3600s | 自然过期（歌词不变） |

规律：**读多写少且几乎只读的（歌词、专辑）给长 TTL；会被"喜欢/收藏"操作改的给短 TTL + 主动失效。**

### 鉴权

- 无 `Depends(get_session)` 的接口只有 `/api/auth/qr/*`、`/api/auth/restore` 和 `/api/health`。
- 会话是纯内存的：**后端重启 = 全员掉线**（本地单机工具可接受；要持久化就换 SQLite/Redis 改 `session.py` 一个文件）。掉线后前端用浏览器保存的凭证调 `restore` 静默重建会话（v0.1.4+），用户无感。
- 上游凭据（网易云 Cookie）服务端只存内存、**零落盘**；同时自 v0.1.4 起也由浏览器 localStorage 保管（多账号凭证库，可查看/移除/清空），凭据不出 localhost 信任域。

### 并发模型

- uvicorn 事件循环 + 全 `async def`：IO 密集、并发友好。
- 唯一的同步阻塞点（SDK）先压进 `max_workers=1` 的线程池串行，再经 Pipe RPC 串行进入 worker 子进程执行——**吞吐被刻意牺牲换取稳定性**（SDK 非线程安全）。worker 崩溃后由主进程重建（SDK 冷启动约 1~2s），失败的请求返回可读 502，服务其余部分不受影响。
- 双锁设计：`threading.Lock`（SDK 与内存 store 的线程安全）、`asyncio.Lock`（协程层面合并重复的上游请求）。

### 错误处理

```
业务层 raise not_found / unauthorized / bad_gateway / rate_limited
   （HTTPException, detail = {"code": 业务码, "message": 中文提示}）
        ↓
main.py @app.exception_handler(HTTPException)
   → {"code": ..., "message": ..., "data": null}
main.py @app.exception_handler(Exception)   ← 兜底
   → 500 {"code": 5000, "message": "服务器内部错误"}（不泄漏堆栈）
```

统一响应体：成功 `{"code": 0, "message": "ok", "data": ...}`（`models/common.py::ok`），失败 `code != 0`。前端只需看 `code`。

**错误文案约定**：`message` 是给用户看的中文短句（前端错误区直接展示并带「重试」按钮）；status、`body.code`、异常堆栈等技术细节只写服务端日志（`csplayer.*` logger），不进响应。`main.py` 兜底 handler 现在也会 `logger.error` 记录未处理异常。

---

## 5. API 总表

| 方法 | 路径 | 登录 | 所在文件 |
|---|---|---|---|
| GET | `/api/health` | ✗ | main.py |
| POST | `/api/auth/qr/key` | ✗ | routers/auth.py |
| POST | `/api/auth/qr/create` | ✗ | routers/auth.py |
| POST | `/api/auth/qr/check` | ✗ | routers/auth.py |
| POST | `/api/auth/restore` | ✗ | routers/auth.py |
| GET | `/api/auth/me` | ✓ | routers/auth.py |
| POST | `/api/auth/logout` | ✓ | routers/auth.py |
| GET | `/api/user/playlists` | ✓ | routers/song.py |
| GET | `/api/user/albums` | ✓ | routers/song.py |
| GET | `/api/user/likes` | ✓ | routers/song.py |
| GET | `/api/user/liked-ids` | ✓ | routers/song.py |
| GET | `/api/user/record` | ✓ | routers/song.py |
| GET | `/api/playlist/{id}` | ✓ | routers/song.py |
| GET | `/api/album/{id}` | ✓ | routers/song.py |
| GET | `/api/song/{id}/url` | ✓ | routers/song.py |
| GET | `/api/song/{id}/lyric` | ✓ | routers/song.py |
| GET | `/api/song/{id}/detail` | ✓ | routers/song.py |
| POST | `/api/song/{id}/like` | ✓ | routers/song.py |
| GET | `/api/search` | ✓ | routers/search.py |
| GET | `/api/artist/{id}` | ✓ | routers/search.py |
| GET | `/api/artist/{id}/albums` | ✓ | routers/search.py |
| GET | `/api/stream/{id}` | ✓ | routers/stream.py |

启动：`cd backend && uvicorn app.main:app --reload --port 8000`（uvicorn 是 ASGI 服务器，负责跑 FastAPI 这个 ASGI 应用；`app.main:app` = `app/main.py` 里的 `app` 对象）。
交互式 API 文档：启动后访问 `http://localhost:8000/docs`（FastAPI 自动生成的 Swagger UI，Pydantic 模型即 schema）。

---

## 6. 常见改动的"落点"指引

| 想做的事 | 改哪里 |
|---|---|
| 加一个新接口 | `models/` 定 DTO → `services/` 写业务（记得用 `ncm_call` + `cache`）→ `routers/` 加路由 → 需要鉴权就 `Depends(get_session)` |
| 接入新的网易云接口 | `services/` 里 `ncm_call("方法名", cookie=..., **参数)`，返回 `resp.body` dict，用 `mappers.py` 转 DTO |
| 调缓存时长 | `core/config.py` 的 `cache_ttl` |
| 字段/返回结构不一致 | 先看 `mappers.py`（新旧字段兼容都在这） |
| 改登录方式（手机号等） | `services/auth_service.py` + `routers/auth.py`，会话部分不用动 |
| SDK 崩溃 / access violation | 崩溃已被 worker 隔离（自动重启），一般只需前端点「重试」；排查看 `docs/archived/DEBUG.md`。**禁止**进程内重试 / 重建实例 / 调用 `destroy()`（会在坏堆上二次崩） |
| 需要持久化会话/缓存 | 只需替换 `core/session.py` / `core/cache.py` 的内部实现（接口保持不变） |

---

## 7. 已知局限（设计取舍，不是遗漏）

1. **全内存状态**（会话、缓存）：重启掉线（前端用浏览器凭证自动恢复，v0.1.4+）、缓存清空；多进程部署会话不共享（也因此 uvicorn 只跑单进程）。
2. **SDK 串行调用 + worker 单点**：所有网易云请求排队进单个 worker，一个慢请求会拖慢后面的（用缓存缓解）；worker 崩溃后重建有 1~2s 冷启动，反复崩会触发 30s 熔断退避（期间返回可读 502，但服务不崩）。
3. **"最近播放"缺失**：`user_record` 实为听歌排行；真正的最近播放接口带登录态触发 SDK 原生崩溃，已搁置（`docs/archived/DEBUG.md` 有完整排查记录）。
4. **无请求日志/指标**、无 CSRF token（靠 SameSite=Lax 缓解）、CORS 白名单写死在配置里。
5. `routers/user.py` 是空壳占位文件，用户相关接口实际在 `song.py`（历史合并结果）。
