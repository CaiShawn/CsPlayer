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
