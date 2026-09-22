# 网易云第三方 Web 播放器 — 第一阶段代码设计文档

> 范围锁定：二维码登录 · 个人/收藏歌单 · 收藏专辑 · 播放器  
> 技术栈：TypeScript (React + Vite + Tailwind + Zustand) + Python (FastAPI + pymusiclibrary)  
> 形态：本地开发双进程（uvicorn + vite），暂不做打包

---

## 1. 目标与非目标

### 1.1 本阶段目标（P1）

| # | 功能 | 说明 |
|---|------|------|
| 1 | 二维码登录 | 扫码后建立会话，展示用户昵称/头像 |
| 2 | 我的歌单 | 分组展示「我创建的」「我收藏的」歌单 |
| 3 | 收藏专辑 | 列表 + 专辑详情（曲目列表） |
| 4 | 歌单详情 | 曲目列表 + 播放 |
| 5 | 播放器 | 播放/暂停、上/下一首、进度、音量、播放队列、播放模式、歌词滚动 |

### 1.2 明确非目标

- 搜索、发现页、排行榜、评论、私人 FM、日推
- 手机号/邮箱登录
- 前后端打包部署、Docker、生产鉴权
- MV / 视频
- 云盘、听歌打卡、动态

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│ Browser                                                  │
│  React 18 + Vite + Tailwind + Zustand                    │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌─────────────────┐  │
│  │ Login  │ │ Library  │ │Detail  │ │ PlayerBar       │  │
│  │ (QR)   │ │ 我的音乐 │ │歌单/专辑│ │ + LyricPanel    │  │
│  └────────┘ └──────────┘ └────────┘ └─────────────────┘  │
│                    │ fetch /api/*  (cookie 会话)         │
└────────────────────┼─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│ FastAPI (uvicorn :8000)                                  │
│  routers/     services/        core/                     │
│  auth.py  ──► auth_service ──► ncm_client (thread-local) │
│  user.py  ──► library_service ► session (cookie)         │
│  song.py  ──► music_service  ► cache (TTL dict)          │
│  stream.py──► stream_service ► lyric (LRC 解析)          │
└──────────────────────────────────────────────────────────┘
```

**职责边界**

| 层 | 职责 | 禁止 |
|----|------|------|
| 前端 | UI、播放控制、歌词渲染、本地队列状态 | 直连网易云、持有登录密码 |
| 后端 | SDK 调用、会话、DTO 裁剪、缓存、音频代理 | 业务 UI 逻辑 |

---

## 3. 目录结构（第一阶段落地）

```
wyy-web-player/
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py
│       │   ├── ncm_client.py
│       │   ├── session.py
│       │   ├── cache.py
│       │   └── errors.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── common.py          # ApiResponse, Page
│       │   ├── user.py            # UserProfile
│       │   ├── song.py            # SongSummary, SongUrl, LyricLine
│       │   ├── playlist.py        # PlaylistBrief, PlaylistDetail
│       │   └── album.py           # AlbumBrief, AlbumDetail
│       ├── services/
│       │   ├── __init__.py
│       │   ├── auth_service.py
│       │   ├── library_service.py
│       │   └── music_service.py
│       └── routers/
│           ├── __init__.py
│           ├── auth.py
│           ├── user.py
│           ├── song.py
│           └── stream.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router.tsx
│       ├── api/
│       │   ├── client.ts
│       │   ├── auth.ts
│       │   ├── user.ts
│       │   └── song.ts
│       ├── types/
│       │   └── index.ts
│       ├── stores/
│       │   ├── authStore.ts
│       │   └── playerStore.ts
│       ├── hooks/
│       │   ├── useAudioEngine.ts
│       │   ├── useLyricSync.ts
│       │   └── useQrLogin.ts
│       ├── utils/
│       │   ├── lrc.ts
│       │   └── format.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── MainLayout.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── RequireAuth.tsx
│       │   ├── player/
│       │   │   ├── PlayerBar.tsx
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── VolumeControl.tsx
│       │   │   ├── PlayModeButton.tsx
│       │   │   └── QueuePanel.tsx
│       │   ├── lyric/
│       │   │   └── LyricPanel.tsx
│       │   ├── media/
│       │   │   ├── SongTable.tsx
│       │   │   ├── PlaylistCard.tsx
│       │   │   └── AlbumCard.tsx
│       │   └── common/
│       │       ├── Cover.tsx
│       │       ├── Loading.tsx
│       │       └── Empty.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── LibraryPage.tsx
│           ├── PlaylistPage.tsx
│           └── AlbumPage.tsx
└── PHASE1_DESIGN.md
```

---

## 4. 后端详细设计

### 4.1 core/config.py

```python
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:5173"]
    cookie_name: str = "wyy_session"
    session_ttl: int = 7 * 24 * 3600
    cache_ttl: dict[str, int] = {
        "user_profile": 300,
        "user_playlists": 60,
        "playlist_detail": 120,
        "album_detail": 300,
        "song_url": 60,      # URL 会过期，短缓存
        "lyric": 3600,
        "song_detail": 300,
    }
    stream_referer: str = "https://music.163.com"
```

### 4.2 core/ncm_client.py — SDK 实例管理

**约束（来自 SDK README）**：`NeteaseCloudMusicApi` **不能跨线程使用**。

设计：

```python
# 每线程一个实例；登录后注入 cookie 字符串
_local = threading.local()

def get_ncm(cookie: str | None = None) -> NeteaseCloudMusicApi:
    api = getattr(_local, "api", None)
    if api is None:
        api = NeteaseCloudMusicApi()
        _local.api = api
        _local.cookie = None
    if cookie is not None and cookie != _local.cookie:
        # 注入/刷新登录态（具体注入方式以 SDK 为准：
        # 可能是构造参数、set_cookie、或 request 时携带）
        _apply_cookie(api, cookie)
        _local.cookie = cookie
    return api

def run_ncm(fn, *args, **kwargs) -> Response:
    """在 worker 线程执行 SDK 调用，返回统一 Response。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_pool, functools.partial(fn, *args, **kwargs))
```

实现注意：

1. FastAPI 路由是 async，SDK 是同步 FFI → 一律 `run_in_executor`。
2. 线程池 `max_workers=4`，每线程独立 API 实例，满足线程安全。
3. `_apply_cookie` 在实现时以 `neteaseCloudMusicApi.py` / `NcmProcessEnv` 源码为准确定注入点；若 SDK 仅构造时传 cookie，则改为「按 cookie 缓存实例」字典 + 锁。

### 4.3 core/session.py — 登录会话

```
浏览器                    后端                         网易云
  │  POST /api/auth/qr/key      │                          │
  │────────────────────────────►│  login_qr_key            │
  │  { unikey }                 │─────────────────────────►│
  │◄────────────────────────────│                          │
  │  POST /api/auth/qr/create   │                          │
  │────────────────────────────►│  login_qr_create(qrimg)  │
  │  { qrimg_base64, unikey }   │─────────────────────────►│
  │◄────────────────────────────│                          │
  │  轮询 POST /api/auth/qr/check (2s)                     │
  │────────────────────────────►│  login_qr_check(unikey)  │
  │  { status: waiting|scanned| │─────────────────────────►│
  │    success|expired }        │  Set-Cookie: wyy_session │
  │◄────────────────────────────│  存 cookie → session 存储 │
```

- **会话存储**：内存 dict `{sid: {cookie, user_id, created_at}}`（P1 不引入 Redis）。
- **浏览器凭证**：httpOnly Cookie `wyy_session=<sid>`（SameSite=Lax）。
- **登出**：清 session + 调 SDK `logout`。
- **鉴权中间件**：除 `auth/*` 与 `stream/*` 外，要求有效 session。

QR 状态机：

| SDK check 含义 | 映射 status | 前端展示 |
|----------------|-------------|----------|
| 801 / 等待扫码 | `waiting` | 显示二维码 |
| 802 / 已扫码 | `scanned` | 「请在手机上确认」 |
| 803 / 成功 | `success` | 写 cookie，跳转 Library |
| 800 / 过期 | `expired` | 「已过期，点击刷新」 |

### 4.4 core/cache.py

```python
class TTLCache:
    def get(key: str) -> Any | None
    def set(key: str, value: Any, ttl: int) -> None
    def invalidate_prefix(prefix: str) -> None   # 登出/喜欢变更后清理
```

- Key 约定：`"{ns}:{user_id or 'anon'}:{biz_id}"`
- 例：`playlist:123:detail`、`user:uid:playlists`、`song:sid:url`
- 不缓存：二维码创建/检查、stream

### 4.5 models — DTO（前后端对齐的唯一契约）

```python
# common
class ApiResponse(BaseModel):
    code: int          # 0 成功，非 0 业务错误
    message: str
    data: Any

# user
class UserProfile(BaseModel):
    userId: int
    nickname: str
    avatarUrl: str
    signature: str = ""

# song
class SongArtist(BaseModel):
    id: int
    name: str

class SongSummary(BaseModel):
    id: int
    name: str
    artists: list[SongArtist]
    albumId: int
    albumName: str
    coverUrl: str
    durationMs: int
    playable: bool = True     # url 为空/VIP 限制时 False
    reason: str = ""          # 不可播原因

class SongUrl(BaseModel):
    id: int
    url: str                  # 原始 url；前端播 /api/stream/{id}
    br: int                   # 码率
    expireAt: int             # 秒级时间戳
    playable: bool

class LyricLine(BaseModel):
    timeMs: int
    text: str

class Lyric(BaseModel):
    lrc: list[LyricLine]
    tlyric: list[LyricLine] = []   # 翻译，可空
    hasTime: bool = True           # 无时间轴纯文本歌词时 False

# playlist
class PlaylistBrief(BaseModel):
    id: int
    name: str
    coverUrl: str
    trackCount: int
    creatorName: str
    subscribed: bool          # True=收藏的，False=我创建的

class PlaylistDetail(BaseModel):
    id: int
    name: str
    coverUrl: str
    description: str = ""
    creatorName: str
    subscribed: bool
    trackCount: int
    tracks: list[SongSummary]

# album
class AlbumBrief(BaseModel):
    id: int
    name: str
    coverUrl: str
    artistName: str
    publishTime: int | None = None
    size: int = 0

class AlbumDetail(BaseModel):
    id: int
    name: str
    coverUrl: str
    artistId: int
    artistName: str
    description: str = ""
    publishTime: int | None = None
    tracks: list[SongSummary]
```

**映射规则**：Service 层负责从 SDK `Response.body` 剥壳 → DTO。字段名前端用 camelCase，Python 用同名（Pydantic 配置 `populate_by_name`），减少映射成本。

### 4.6 REST API 契约

统一响应：`ApiResponse`；HTTP 状态码语义化（401 未登录，404 无资源，502 SDK 失败）。

#### Auth

| Method | Path | Body / Query | Response.data | 说明 |
|--------|------|--------------|---------------|------|
| POST | `/api/auth/qr/key` | — | `{ unikey }` | 获取二维码 key |
| POST | `/api/auth/qr/create` | `{ unikey }` | `{ unikey, qrimg }` | `qrimg` 为 base64 PNG |
| POST | `/api/auth/qr/check` | `{ unikey }` | `{ status, cookie? }` | 前端 2s 轮询 |
| POST | `/api/auth/logout` | — | `{}` | 清会话 |
| GET | `/api/auth/me` | — | `UserProfile` | 401=未登录 |

#### User Library

| Method | Path | Response.data | 说明 |
|--------|------|---------------|------|
| GET | `/api/user/playlists` | `{ created: PlaylistBrief[], subscribed: PlaylistBrief[] }` | 按 `subscribed` 拆分 |
| GET | `/api/user/albums` | `AlbumBrief[]` | 已收藏专辑 |

#### Detail

| Method | Path | Response.data |
|--------|------|---------------|
| GET | `/api/playlist/{id}` | `PlaylistDetail` |
| GET | `/api/album/{id}` | `AlbumDetail` |

#### Song / Stream

| Method | Path | Response.data | 说明 |
|--------|------|---------------|------|
| GET | `/api/song/{id}/url` | `SongUrl` | `playable=false` 时 url 空串 |
| GET | `/api/song/{id}/lyric` | `Lyric` | 已解析 LRC |
| GET | `/api/song/{id}/detail` | `SongSummary` | 列表缺字段时补全 |
| GET | `/api/stream/{id}` | audio/* | 见 4.7；可不走 ApiResponse |

#### 示例：`GET /api/user/playlists`

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "created": [
      {
        "id": 123,
        "name": "我喜欢的音乐",
        "coverUrl": "https://...",
        "trackCount": 88,
        "creatorName": "我",
        "subscribed": false
      }
    ],
    "subscribed": [
      {
        "id": 456,
        "name": "收藏夹",
        "coverUrl": "https://...",
        "trackCount": 200,
        "creatorName": "某人",
        "subscribed": true
      }
    ]
  }
}
```

#### 示例：`GET /api/song/{id}/lyric`

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "lrc": [
      { "timeMs": 0, "text": "作词 : 某某" },
      { "timeMs": 18200, "text": "第一句歌词" }
    ],
    "tlyric": [],
    "hasTime": true
  }
}
```

### 4.7 stream 音频代理

```
GET /api/stream/{song_id}
→ 查 song_url（带短缓存）
→ 若无 url：403 + JSON {code, message}
→ 若有：
   浏览器带 Range 则转发 Range，否则 200 全量
   响应头：Content-Type（源站）、Content-Length、Accept-Ranges
   建议加 Referer: https://music.163.com（提升防盗链成功率）
```

实现：`httpx.AsyncClient.stream` 流式回传，避免整文件进内存。  
前端 `<audio src="/api/stream/{id}">`，同源无需 CORS。

### 4.8 Service 层职责

| Service | 方法 | 调用 SDK（方法名以源码为准） | 缓存 |
|---------|------|------------------------------|------|
| auth_service | `qr_key / qr_create / qr_check / logout / me` | `login_qr_*`, `logout`, `user_account` | 无 / me 有 |
| library_service | `playlists / albums / playlist_detail / album_detail` | `user_playlist`, `album_sublist`, `playlist_detail`, `album` | 有 |
| music_service | `song_url / lyric / song_detail` | `song_url`, `lyric`, `song_detail` | url 短缓存 |

错误映射：

| 情况 | HTTP | code |
|------|------|------|
| 未登录 | 401 | 1001 |
| 歌单/专辑不存在 | 404 | 2001 |
| 无版权/无 url | 200 | 3001 + `playable:false` |
| SDK status≠200 | 502 | 5001 |

### 4.9 main.py 装配

```python
app = FastAPI(title="wyy-web-player")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router, prefix="/api/auth")
app.include_router(user.router, prefix="/api/user")
app.include_router(song.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
# 可选：挂载 frontend/dist（本阶段不强制）
```

---

## 5. 前端详细设计

### 5.1 路由

| Path | 组件 | 鉴权 | 说明 |
|------|------|------|------|
| `/login` | LoginPage | 公开 | 二维码 |
| `/` | → redirect `/library` | | |
| `/library` | LibraryPage | 需登录 | 创建/收藏歌单 + 收藏专辑 |
| `/playlist/:id` | PlaylistPage | 需登录 | |
| `/album/:id` | AlbumPage | 需登录 | |

`RequireAuth`：无 `authStore.user` 时跳 `/login`。  
启动时 `GET /api/auth/me` 探测登录态。

### 5.2 类型（`types/index.ts`）

与后端 DTO 一一对应，另加播放器内部类型：

```ts
export type PlayMode = 'order' | 'list-loop' | 'single' | 'shuffle'

export interface PlayerState {
  queue: SongSummary[]
  currentIndex: number          // -1 表示空
  playing: boolean
  playMode: PlayMode
  currentTime: number           // 秒
  duration: number
  volume: number                // 0..1
  muted: boolean
  lyric: Lyric
  currentLyricIndex: number
  queueVisible: boolean
  lyricVisible: boolean
}
```

### 5.3 stores

**authStore**

```ts
{ user: UserProfile | null, loading: boolean,
  fetchMe(), loginSuccess(user), logout() }
```

**playerStore**（唯一播放状态源）

```ts
// 查询
currentSong(): SongSummary | null

// 动作
playSongs(list: SongSummary[], startIndex: number)  // 替换队列并播
enqueue(list: SongSummary[])                        // 加入队列（暂不播）
next() / prev()                                     // 依赖 playMode 计算 index
togglePlay() / seek(sec) / setVolume(v) / toggleMute()
setPlayMode(mode) / togglePlayMode()                // 循环切换四种
jumpTo(index: number)                               // 从队列点播
removeFromQueue(index) / clearQueue()
setLyric(lyric) / setCurrentLyricIndex(i)
```

切歌逻辑：

```
next():
  order      → (i+1) % n，到尾停
  list-loop  → (i+1) % n
  single     → 不自动切（ended 时重播）
  shuffle    → random != i
prev(): 对称（shuffle 用 history 栈，P1 简化为 random）
```

### 5.4 hooks

**useAudioEngine** — 全局唯一 `HTMLAudioElement`

```ts
// 挂在 MainLayout，与路由无关
- 订阅 playerStore.currentSong
- song 变化 → api.songUrl(id) →
    playable ? audio.src = `/api/stream/${id}` : toast「暂无版权」+ auto next
    并行 api.lyric(id) → setLyric
- audio 事件 → 同步 store: timeupdate / ended / loadedmetadata / error
- store 指令 → audio: play/pause/currentTime/volume
```

**useLyricSync** — 歌词与进度对齐

```ts
// LyricPanel 内
currentTime 变化 → 在 lrc[] 上二分 timeMs → setCurrentLyricIndex
```

**useQrLogin** — 二维码轮询

```ts
createQr() → key + qrimg → 本地展示
poll(check 2s):
  success → fetchMe() + navigate('/library')
  expired → stop + 显示刷新按钮
  waiting/scanned → 更新 UI 状态
unmount → clear timer
```

**usePlayAll** — 歌单/专辑页「播放全部」

```ts
playAll(tracks) → filter playable → playSongs(tracks, 0)
```

### 5.5 组件层级

```
MainLayout
├── Sidebar                          # 入口：我的音乐 / 收藏专辑
├── <Outlet/>                        # Login | Library | Playlist | Album
├── PlayerBar                        # 底栏固定
│   ├── Cover + 歌名/歌手（点开 LyricPanel）
│   ├── Prev | PlayPause | Next
│   ├── PlayModeButton
│   ├── ProgressBar + 时间
│   ├── VolumeControl
│   └── 队列按钮 → QueuePanel
├── QueuePanel                       # 右侧抽屉/浮层
└── LyricPanel                       # 全屏或侧栏歌词
```

**SongTable 列**：`# | 标题 | 歌手 | 专辑 | 时长`；行双击播放；当前行高亮；`playable=false` 灰显禁播。

### 5.6 页面规格

**LoginPage**  
- 居中卡片：QR 图（base64）、状态文案、「二维码已过期 · 点击刷新」、底部免责一行。

**LibraryPage**  
- Tab 或分区：
  1. **我创建的** — `PlaylistCard[]`，首项为「我喜欢的音乐」（若 SDK 返回）。
  2. **我收藏的** — `PlaylistCard[]`。
  3. **收藏的专辑** — `AlbumCard[]`。
- 卡片：封面、名称、数量；点击进详情。

**PlaylistPage**  
- 头：封面、歌名、创建者、trackCount、简介、「播放全部」。
- 体：`SongTable(tracks)`。

**AlbumPage**  
- 头：封面、专辑名、歌手（暂不跳歌手页）、发行时间、简介、「播放全部」。
- 体：`SongTable(tracks)`。

### 5.7 api/client.ts

```ts
// fetch 封装
- baseUrl: '' + vite proxy → http://127.0.0.1:8000
- credentials: 'include'
- 解析 ApiResponse，非 0 / 非 2xx throw ApiError
- 401 → 清 authStore → redirect /login
```

### 5.8 vite 代理

```ts
server: {
  proxy: {
    '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true }
  }
}
```

### 5.9 样式约定（Tailwind）

- 深色主题：`bg-neutral-950 text-neutral-100`，强调色 `emerald-500`（可调）。
- 布局：`Sidebar 240px + 主区 flex-1 + PlayerBar h-20 fixed bottom`。
- 主区 `pb-24` 防止被播放条遮挡。

---

## 6. 核心时序

### 6.1 二维码登录

```
LoginPage → POST qr/key → POST qr/create → 显示 qrimg
每 2s → POST qr/check
  success → Set-Cookie → GET /api/auth/me → authStore.user → /library
```

### 6.2 播放一首歌

```
SongTable dblclick(index)
  → playerStore.playSongs(tracks, index)
  → useAudioEngine 观察到 currentSong 变化
      → GET /api/song/{id}/url     ┐ 并行
      → GET /api/song/{id}/lyric   ┘
      → playable ? audio.src=/api/stream/{id}.play()
                : toast + next()
```

### 6.3 自然播完

```
audio.onended → playerStore 按 playMode 算 next index
  single → audio.currentTime=0; play()
  其他   → setCurrentIndex(next)  // 触发 6.2
```

---

## 7. 错误与边界

| 场景 | 处理 |
|------|------|
| QR 过期 | 自动停止轮询，显示刷新 |
| 会话失效（401） | 全局拦截 → 清空队列可选 → `/login` |
| 歌曲无版权 | 行内「不可播」，播放全部时过滤，队列自动跳过 |
| 歌词无时间轴 | `hasTime=false`，LyricPanel 只展示文本不滚动 |
| 空歌单/空专辑 | `Empty` 组件 |
| SDK 解析失败 | 后端 502 + message；前端 Toast |
| stream 中断 | `audio.onerror` Toast + 尝试下一首 |

---

## 8. 依赖与本地启动

### backend/requirements.txt

```
fastapi>=0.115
uvicorn[standard]>=0.32
pydantic>=2.0
httpx>=0.27
pymusiclibrary>=0.2.1
```

> 若 `pip install pymusiclibrary` 在 Windows 缺预编译库，按上游 `setLibArch.py win64` + `MUSICLIB_ARCH=win64` 处理。

### 启动（开发）

```powershell
# terminal 1
cd backend
uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend
npm install
npm run dev    # :5173
```

浏览器打开 `http://localhost:5173`。

---

## 9. 实现顺序（编码任务清单）

按依赖排序，每步可独立验证：

| Step | 内容 | 验收 |
|------|------|------|
| 1 | 后端骨架：config / errors / ApiResponse / main 路由挂载 | `GET /api/auth/me` 返回 401 |
| 2 | ncm_client + run_in_executor + 假数据 service | 单测/手动调 SDK 通 |
| 3 | auth：qr_key/create/check + session cookie | Postman 走通扫码登录 |
| 4 | user：playlists 拆分 created/subscribed + albums | JSON 结构符合 §4.6 |
| 5 | detail：playlist / album + DTO 裁剪 | 含 playable 逻辑 |
| 6 | song：url / lyric（LRC 解析进 `utils` 后端版） | curl 歌词为行数组 |
| 7 | stream 代理 + Range | 浏览器直接打开 stream 能听 |
| 8 | 前端骨架：Vite+Tailwind+Router+layout+api client | 空页可跑 |
| 9 | LoginPage + useQrLogin | 扫码进 Library |
| 10 | LibraryPage 三区列表 | 真实数据 |
| 11 | PlaylistPage / AlbumPage + SongTable | 双击不播也能选中 |
| 12 | playerStore + useAudioEngine + PlayerBar | **能播** |
| 13 | 队列、播放模式、上一首/下一首 | 模式切换正确 |
| 14 | LyricPanel + useLyricSync | 跟唱滚动 |
| 15 | 401 跳转、错误 Toast、Empty、不可播禁用 | 边界可用 |

**MVP 验收（第 12 步后即可用）**  
登录 → 看到创建/收藏歌单与收藏专辑 → 进详情 → 播放全部 → 播放条可控 → 歌词滚动。

---

## 10. 风险与待实现时确认

| 项 | 风险 | 对策 |
|----|------|------|
| SDK 方法名/cookie 注入方式 | README 未给完整签名 | Step 2 直接读 `neteaseCloudMusicApi.py` 对齐 |
| 预编译库安装失败 | Windows 二进制加载 | 按上游 win64 流程；必要时源码构建 |
| 歌曲 URL 鉴权/防盗链 | 直链 403 | stream 代理 + Referer；仍失败则提示不可播 |
| QR 登录风控 | 频繁轮询被限 | 2s 间隔、失败退避 |
| 「我喜欢的音乐」归属 | 可能在 created 首位 | 以 `user_playlist` 实际字段为准，UI 固定置顶 |

---

## 11. 本阶段不写、但接口预留

- `GET /api/search/*` — 搜索（下一阶段）
- `GET /api/user/likes` / `POST /api/song/{id}/like` — 喜欢
- `GET /api/recommend/*` — 日推/推荐
- 评论、歌手页、MV

预留方式：DTO 与 `music_service` 留扩展方法空位，不实现路由。
