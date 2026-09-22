# CsPlayer 初始设计文档（P1）

> 范围：二维码登录 · 个人/收藏歌单 · 收藏专辑 · 播放器  
> 技术栈：React 18 + Vite + Tailwind + Zustand ｜ FastAPI + pymusiclibrary  
> 形态：本地双进程开发（uvicorn :8000 + vite :5173），不做打包

---

## 1. 目标与非目标

**本阶段目标**

| # | 功能 | 说明 |
|---|------|------|
| 1 | 二维码登录 | 扫码建会话，展示昵称/头像 |
| 2 | 我的歌单 | 「我创建的」「我收藏的」分区 |
| 3 | 收藏专辑 | 列表 + 详情曲目 |
| 4 | 歌单详情 | 曲目列表 + 播放 |
| 5 | 播放器 | 播/停、上下曲、进度、音量、队列、播放模式、歌词滚动 |

**非目标**：搜索 / 发现 / 排行榜 / 评论 / 私人 FM / 日推 / 手机号登录 / 打包部署 / MV / 云盘 / 听歌打卡。

---

## 2. 系统架构

```
Browser  React + Vite + Tailwind + Zustand
  Login · Library · Detail · PlayerBar + LyricPanel + QueuePanel
        │  fetch /api/*  (cookie 会话 wyy_session)
        ▼
FastAPI (uvicorn :8000)
  routers/  auth.py · song.py · stream.py · deps.py
  services/ auth_service · library_service · music_service · mappers
  core/     config · ncm_client · session · cache · errors
```

| 层 | 职责 | 禁止 |
|----|------|------|
| 前端 | UI、播放控制、歌词渲染、队列状态 | 直连网易云、持有密码 |
| 后端 | SDK 调用、会话、DTO 裁剪、缓存、音频代理 | 业务 UI 逻辑 |

---

## 3. 目录结构

```
CsPlayer/
├── README.md
├── docs/
│   ├── INIT_DESIGN.md          # 本文档
│   ├── V0.1.1_DESIGN.md
│   └── SDK参考文档.md
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── core/        config · ncm_client · session · cache · errors
│       ├── models/      common · user · song · playlist · album
│       ├── services/    auth_service · library_service · music_service · mappers
│       └── routers/     auth · song · stream · deps · user(空壳)
└── frontend/
    ├── package.json · vite.config.ts · tailwind.config.js · postcss.config.js · tsconfig.json
    └── src/
        ├── main.tsx · App.tsx · index.css
        ├── api/        client.ts · index.ts
        ├── types/      index.ts
        ├── stores/     authStore.ts · playerStore.ts
        ├── hooks/      useAudioEngine.ts · useQrLogin.ts
        ├── utils/      lyric.ts · format.ts
        ├── components/
        │   ├── layout/  MainLayout.tsx
        │   ├── player/  PlayerBar.tsx · Controls.tsx · QueuePanel.tsx
        │   ├── lyric/   LyricPanel.tsx
        │   ├── media/   SongTable.tsx
        │   └── common/  Ui.tsx · Cover.tsx
        └── pages/       LoginPage.tsx · LibraryPage.tsx · DetailPages.tsx
```

与早期草案的差异（已按实现落地）：

- 无 `router.tsx`，路由写在 `App.tsx`
- API 聚合在 `api/index.ts`（`authApi` / `libraryApi` / `songApi`），无分文件
- `Sidebar` / `RequireAuth` 内联在 `MainLayout` / `App`
- `PlaylistCard` / `AlbumCard` 内联在 `LibraryPage`
- `ProgressBar` / `VolumeControl` / `PlayModeButton` 合并为 `Controls.tsx`
- `Loading` / `Empty` / `Toast` 合并为 `common/Ui.tsx`
- LRC 解析放后端 `music_service`；前端 `utils/lyric.ts` 仅做二分查找
- 歌词同步在 `playerStore.syncLyricIndex`，无独立 `useLyricSync`
- 新增 `routers/deps.py`（鉴权依赖 + cookie）与 `services/mappers.py`（SDK→DTO）

---

## 4. 后端

### 4.1 core/config.py

```python
@dataclass
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cookie_name: str = "wyy_session"
    session_ttl: int = 7 * 24 * 3600
    cache_ttl: dict = {
        "user_profile": 300, "user_playlists": 60, "album_sublist": 60,
        "playlist_detail": 120, "album_detail": 300,
        "song_url": 60, "lyric": 3600, "song_detail": 300,
    }
    stream_referer: str = "https://music.163.com"
    executor_workers: int = 4
```

### 4.2 core/ncm_client.py

SDK 非线程安全（QuickJS），实现为 **进程内单例 + 固定单线程 executor + 全局锁**，禁止 `destroy`：

```python
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ncm-sdk")

async def ncm_call(fn_name: str, cookie: dict | None = None, **kwargs) -> Response:
    def runner():
        with _lock:
            return getattr(_get_api(), fn_name)(cookie=cookie or {}, **kwargs)
    return await asyncio.get_running_loop().run_in_executor(_executor, runner)
```

- cookie 按 **dict** 注入每次调用（SDK 方法接受 `cookie=` 关键字）。
- FastAPI async 路由 → 一律 `run_in_executor`。

### 4.3 core/session.py

- `SessionStore`：内存 dict + 锁，`{sid: {cookie: dict, user_id, created_at}}`，TTL 过期删除。
- `sid = secrets.token_urlsafe(24)`；浏览器凭 httpOnly Cookie `wyy_session=<sid>`（SameSite=Lax）。
- `parse_cookie_str` / `merge_set_cookie` 辅助解析上游 Cookie。
- 登出：调 SDK `logout` + `sessions.delete` + 清相关缓存。
- 鉴权：`routers/deps.get_session` 依赖注入，未登录/失效 → `401 {"code":1001}`。

### 4.4 core/cache.py

```python
class TTLCache:
    def get(key) -> Any | None
    def set(key, value, ttl) -> None
    def invalidate(key) -> None
    def invalidate_prefix(prefix) -> None
```

Key 约定：`"{ns}:{user_id or 'anon'}:{biz_id}"`，如 `user:123:playlists`、`song:456:url`。  
不缓存：二维码创建/检查、stream。

### 4.5 core/errors.py

`AppError` + 快捷函数 `unauthorized`(401/1001) · `not_found`(404/2001) · `bad_gateway`(502/5001) · `rate_limited`(429/4290)。  
HTTP 错误体：`{"code", "message"}`（FastAPI `detail`），成功体：`{"code":0, "message":"ok", "data"}`。

### 4.6 models — DTO（前后端契约，字段名 camelCase）

与 `frontend/src/types/index.ts` 一一对应：

| 类型 | 字段 |
|------|------|
| `ApiResponse` | `code`, `message`, `data` |
| `UserProfile` | `userId`, `nickname`, `avatarUrl`, `signature` |
| `SongArtist` | `id`, `name` |
| `SongSummary` | `id`, `name`, `artists[]`, `albumId`, `albumName`, `coverUrl`, `durationMs`, `playable`, `reason` |
| `SongUrl` | `id`, `url`, `br`, `expireAt`, `playable` |
| `LyricLine` | `timeMs`, `text` |
| `Lyric` | `lrc[]`, `tlyric[]`, `hasTime` |
| `PlaylistBrief` | `id`, `name`, `coverUrl`, `trackCount`, `creatorName`, `subscribed` |
| `PlaylistDetail` | 上行 + `description`, `tracks[]` |
| `AlbumBrief` | `id`, `name`, `coverUrl`, `artistName`, `publishTime`, `size` |
| `AlbumDetail` | 上行 + `artistId`, `description`, `tracks[]` |

映射规则：`services/mappers.py` 负责 SDK `Response.body` → DTO（`al/ar/dt` 等字段别名兼容）。

### 4.7 REST API

统一成功响应 `ApiResponse`。鉴权：除 auth 外均需 session（`get_session`）。

| Method | Path | 说明 | Response.data |
|--------|------|------|---------------|
| POST | `/api/auth/qr/key` | 取 unikey（服务端 25s 缓存 + 4s 上游限频，防 406） | `{unikey}` |
| POST | `/api/auth/qr/create` | 生成二维码；SDK `qrimg` 不可用时用 `qrurl` 本地渲染 | `{unikey, qrimg, qrurl}` |
| POST | `/api/auth/qr/check` | 轮询；成功时 `Set-Cookie: wyy_session` | `{status, user?}` |
| POST | `/api/auth/logout` | 清会话 + 上游 logout | `{}` |
| GET | `/api/auth/me` | 当前用户 | `UserProfile` |
| GET | `/api/user/playlists` | 按 `subscribed` 拆分；「我喜欢的」置顶 | `{created[], subscribed[]}` |
| GET | `/api/user/albums` | 收藏专辑（分页拉全） | `AlbumBrief[]` |
| GET | `/api/playlist/{id}` | 歌单详情 + 曲目 | `PlaylistDetail` |
| GET | `/api/album/{id}` | 专辑详情 + 曲目 | `AlbumDetail` |
| GET | `/api/song/{id}/url` | 可播地址；对外只给代理路径 | `SongUrl`（url=`/api/stream/{id}` 或 `""`） |
| GET | `/api/song/{id}/lyric` | LRC 已解析 | `Lyric` |
| GET | `/api/song/{id}/detail` | 曲目补全 | `SongSummary` |
| GET | `/api/stream/{id}` | 音频代理（Range） | audio/*，非 ApiResponse |
| GET | `/api/health` | 健康检查 | `{status:"up"}` |

QR 状态机：

| SDK code | status | 前端 |
|----------|--------|------|
| 801 | `waiting` | 显示二维码 |
| 802 | `scanned` | 「请在手机上确认」 |
| 803 | `success` | 写 cookie，跳 `/library` |
| 800 | `expired` | 「已过期，点击刷新」 |
| 406 | `rate_limited` | 退避 8s 后重试 |

错误映射：

| 情况 | HTTP | code |
|------|------|------|
| 未登录/会话失效 | 401 | 1001 |
| 歌单/专辑/歌曲不存在 | 404 | 2001 |
| 无版权/无 url | 403（stream）或 `playable:false` | 3001 |
| 上游失败 | 502 | 5001 |
| 风控/频繁 | 429 | 4290 |
| 未捕获异常 | 500 | 5000 |

### 4.8 Service 层

| Service | 方法 | SDK 方法 | 缓存 |
|---------|------|----------|------|
| auth_service | `qr_key / qr_create / qr_check / get_me / logout` | `login_qr_*`, `user_account`, `logout` | me 有；qr 有 unikey 短缓存 |
| library_service | `user_playlists / user_albums / playlist_detail / album_detail` | `user_playlist`, `album_sublist`, `playlist_detail`, `playlist_track_all`, `album` | 有 |
| music_service | `song_url / get_lyric / song_detail` | `song_url`, `lyric`, `song_detail` | url 短缓存；LRC 解析在此层 |

补充实现细节：

- **qr_create**：SDK 的 `qrimg` 参数会导致 route 未完成，改为取 `qrurl` 后用 `qrcode` 库本地渲染 base64 PNG。
- **qr_check**：502 时按 SDK 说明用 `noCookie=True` 重试。
- **playlist_detail**：`playlist_detail` 元数据 + `playlist_track_all` 分页拉曲目（limit 100，上限 2000）。
- **song_url**：`br=999000`；router 层不把上游直链暴露给浏览器。

### 4.9 stream 音频代理

```
GET /api/stream/{song_id}
→ song_url（短缓存）
→ 无 url：403 {code:3001}
→ 有：httpx 流式转发；透传 Range
   请求头 Referer: music.163.com（防盗链）
   响应头 Content-Type / Content-Length / Accept-Ranges
```

前端 `<audio src="/api/stream/{id}">`，同源免 CORS。

### 4.10 main.py 装配

```python
app = FastAPI(title="wyy-web-player", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
# 全局 Exception handler → 500 {code:5000}
app.include_router(auth_router.router, prefix="/api/auth")
app.include_router(song_router.router, prefix="/api")   # 含 /user/* /playlist/* /album/* /song/*
app.include_router(stream_router.router, prefix="/api")
# GET /api/health
```

`routers/user.py` 为空壳（user 路由统一挂在 `song.py`）。

---

## 5. 前端

### 5.1 路由（App.tsx）

| Path | 组件 | 鉴权 |
|------|------|------|
| `/login` | LoginPage | 公开 |
| `/` | RequireAuth → MainLayout | 需登录 |
| `/` index | → redirect `/library` | |
| `/library` | LibraryPage | 需登录 |
| `/playlist/:id` | PlaylistPage（DetailPages） | 需登录 |
| `/album/:id` | AlbumPage（DetailPages） | 需登录 |
| `*` | → `/` | |

`RequireAuth`（App.tsx 内联）：`initialized` 前显示 Loading，无 `user` 跳 `/login`；挂载时 `fetchMe()`。

### 5.2 types/index.ts

与后端 DTO 一致；播放器内部：`PlayMode = 'order' | 'list-loop' | 'single' | 'shuffle'`，`QrStatus` 含 `rate_limited`。

### 5.3 stores

**authStore**：`{ user, loading, initialized, fetchMe(), loginSuccess(user), logout(), clear() }`

**playerStore**（唯一播放状态源）：

```
状态：queue, currentIndex, playing, playMode, currentTime, duration,
      volume, muted, lyric, currentLyricIndex, queueVisible, lyricVisible, loadToken

查询：currentSong()
动作：playSongs(list, start) · enqueue(list) · next() · prev() · togglePlay()
      setPlaying · seek · setCurrentTime · setDuration · setVolume · toggleMute
      setPlayMode · togglePlayMode · jumpTo · removeFromQueue · clearQueue
      setLyric · syncLyricIndex(timeSec) · toggleQueue · toggleLyric · handleEnded
```

`loadToken` 递增触发 `useAudioEngine` 重新加载。默认 `playMode='list-loop'`。

切歌：

```
next(auto=false) / handleEnded(auto=true):
  single     → auto 时不切（重播）；手动切 (i+1)%n
  list-loop  → (i+1)%n
  shuffle    → random != i
  order      → i+1；auto 到尾停（-1），手动回到 0
prev(): order 到头停 0；其余取模；shuffle 用 random
```

### 5.4 hooks

**useAudioEngine**（MainLayout 挂载一次）

- 全局唯一 `HTMLAudioElement`；`loadToken` 变化 → 并行 `songApi.url` + `songApi.lyric`
- `playable=false` → `handleEnded()` 自动跳下一首
- 否则 `audio.src = url`（即 `/api/stream/{id}`）并按 `playing` 播放
- audio 事件同步 store：timeupdate（含 `syncLyricIndex`）/ loadedmetadata / ended / play / pause / error
- store 指令 → audio：play/pause、volume/muted；`currentTime` 跳变 >1.2s 视为外部 seek
- 导出 `playTracks(list, startIndex)`

**useQrLogin**

- `qrKey → qrCreate`，展示 `qrimg`；每 **3s** `qrCheck`（`rate_limited` 退避 **8s**）
- `success` → `onSuccess(user)`；`expired` 停止轮询显示刷新
- 模块级缓存 `sharedUnikey/sharedQrimg` + `inflightCreate`，抗 StrictMode 双挂载
- 返回 `{qrimg, status, error, refresh}`

歌词同步走 `playerStore.syncLyricIndex` + `utils/lyric.findLyricIndex`（二分），无独立 hook。

### 5.5 组件

```
MainLayout
├── Sidebar（内联）          我的音乐 · 用户卡片/退出
├── <Outlet/>               Login | Library | Playlist | Album
├── LyricPanel              右侧歌词栏（lyricVisible 显隐；点击行 seek）
└── PlayerBar
    ├── Cover + 歌名/歌手
    ├── PlayModeButton | Prev | PlayPause | Next   （Controls.tsx）
    ├── ProgressBar + 时间
    ├── VolumeControl
    └── 「词」toggleLyric · 「队列」toggleQueue
QueuePanel                  右侧浮层：跳播、移除、清空
```

- `SongTable` 列：`# | 标题 | 歌手 | 专辑 | 时长`；双击播放；当前行高亮；`playable=false` 灰显 + reason。
- `LibraryPage`：三个 Section + `CardGrid`；`PlaylistCard` / `AlbumCard` 内联。
- `DetailPages`：共用 `DetailHeader`（封面/标题/副题/简介/播放全部）+ `SongTable`；播放全部与点播均过滤 `playable`。

### 5.6 api

- `client.ts`：`fetch` + `credentials:'include'`；解析 `ApiResponse`，非 0 / 非 2xx 抛 `ApiError`；`requestWithAuth` 对 401 触发 `setUnauthorizedHandler` → `authStore.clear` + `clearQueue` + 跳 `/login`。
- `index.ts`：`authApi` · `libraryApi` · `songApi`（不含 detail，列表已带全字段）。

### 5.7 样式与代理

- 深色主题 `bg-neutral-950 text-neutral-100`，强调色 `emerald-500`。
- 布局：`Sidebar w-56 + main flex-1 pb-24 + PlayerBar h-20 fixed bottom`；LyricPanel / QueuePanel 宽 `w-80`。
- vite proxy：`/api` → `http://127.0.0.1:8000`。

---

## 6. 核心时序

**二维码登录**

```
LoginPage → qr/key → qr/create → 显示 qrimg
每 3s → qr/check
  success → Set-Cookie → loginSuccess(user) → /library
  expired → 停止轮询，显示刷新
```

**播放一首歌**

```
SongTable 双击 → playSongs(playable 轨, index) → loadToken++
useAudioEngine → GET song/{id}/url + lyric（并行）
  playable → audio.src=/api/stream/{id} → play()
  否则 handleEnded() 自动跳下一首
```

**自然播完**

```
audio.onended → handleEnded()
  single → currentTime=0; playing=true; loadToken++  （重播）
  其他   → 按 playMode 算 next index → loadToken++
  order 到尾 → playing=false
```

---

## 7. 错误与边界

| 场景 | 处理 |
|------|------|
| QR 过期 / 风控 | 停轮询显示刷新 / 退避 8s 自动重试 |
| 会话失效 401 | 全局 handler：清 user + 队列 → `/login` |
| 歌曲无版权 | 行内标 reason；播放全部过滤；队列自动 `handleEnded` 跳过 |
| 歌词无时间轴 | `hasTime=false`，LyricPanel 只展示文本不滚动 |
| 空歌单/空专辑 | `Empty` |
| 上游失败 | 后端 502/429 + message；前端 catch 展示 |
| stream 中断 | `audio.onerror` → setPlaying(false) |

---

## 8. 依赖与启动

**backend/requirements.txt**

```
fastapi>=0.115
uvicorn[standard]>=0.32
pydantic>=2.0
httpx>=0.27
pymusiclibrary>=0.0.4
qrcode[pil]>=8.0
```

> Windows 若缺预编译库，按上游 `setLibArch.py win64` + `MUSICLIB_ARCH=win64` 处理。

**启动**

```powershell
# terminal 1
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend
npm install
npm run dev    # :5173
```

打开 `http://localhost:5173`。

---

## 9. 实现状态（P1 已完成）

| Step | 内容 | 状态 |
|------|------|------|
| 1 | 后端骨架 config/errors/ApiResponse/main | done |
| 2 | ncm_client 单线程 executor + mappers | done |
| 3 | auth：qr/key/create/check + session cookie | done（含风控限频/本地渲染） |
| 4 | user：playlists 拆分 + albums | done |
| 5 | detail：playlist/album + DTO | done |
| 6 | song：url/lyric（后端 LRC 解析） | done |
| 7 | stream 代理 + Range | done |
| 8 | 前端骨架 Vite/Tailwind/Router/api | done |
| 9 | LoginPage + useQrLogin | done |
| 10 | LibraryPage 三区 | done |
| 11 | Playlist/Album + SongTable | done |
| 12 | playerStore + useAudioEngine + PlayerBar | done |
| 13 | 队列、播放模式、上下曲 | done |
| 14 | LyricPanel 歌词滚动/点击 seek | done |
| 15 | 401 跳转、Empty、不可播禁用 | done |

**MVP 验收**：登录 → 创建/收藏歌单与专辑 → 详情 → 播放全部 → 播放条可控 → 歌词滚动。

---

## 10. 风险与对策（已验证）

| 项 | 结论 |
|----|------|
| SDK cookie 注入 | 以 `cookie=` dict 关键字传入每次调用 |
| Windows 预编译库 | 按上游 win64 流程 |
| URL 防盗链 | stream 代理 + Referer |
| QR 风控 406 | 服务端 unikey 缓存 + 上游限频 + 前端退避 |
| 「我喜欢的音乐」 | `user_playlist` 按名称含「喜欢」置顶 |
| SDK `qrimg` 参数 | 不用；`qrurl` + 本地 `qrcode` 渲染 |
| SDK 线程安全 | 单线程 executor，禁止 destroy |

---

## 11. 接口预留（不实现）

- `GET /api/search/*`、`GET /api/user/likes` / `POST /api/song/{id}/like`、`GET /api/recommend/*`
- 评论、歌手页、MV
