import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi } from '../api'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'

/* 模块入口：文案与侧栏统一（S3-1，设计 §4.4）；近来听为本地记录入口（S4） */
const ENTRIES = [
  { to: '/like', title: '我喜欢', desc: '云端红心歌曲，设备同步', icon: '♥' },
  { to: '/recent', title: '近来听', desc: '最近播放，本地记录（暂）', icon: '↺' },
  { to: '/library', title: '音乐库', desc: '我的歌单：创建与收藏的歌单', icon: '☰' },
  { to: '/record', title: '自听榜', desc: '云端听歌排行', icon: '⏱' },
  { to: '/shelf', title: '唱片架', desc: '收藏的专辑', icon: '♫' },
]

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const dataVersion = useAuthStore((s) => s.dataVersion)

  /* 概览数字：异步补数、不阻塞首屏；失败则隐藏该数字（设计 §4.4） */
  const likedIdsSize = useLikesStore((s) => s.ids.size)
  const likesTotal = useLikesStore((s) => s.total)
  const [playlistCount, setPlaylistCount] = useState<number | null>(null)
  const [albumCount, setAlbumCount] = useState<number | null>(null)

  // 我喜欢数：ids 为全量红心集合（v0.1.7 起 tracks 分批加载只是前缀，不可作计数）
  const likesCount = likedIdsSize > 0 ? likedIdsSize : likesTotal > 0 ? likesTotal : null

  useEffect(() => {
    void useLikesStore.getState().fetchIds(dataVersion)
  }, [dataVersion])

  useEffect(() => {
    let cancelled = false
    setPlaylistCount(null)
    setAlbumCount(null)
    libraryApi
      .playlists()
      .then((r) => {
        if (!cancelled) setPlaylistCount(r.created.length + r.subscribed.length)
      })
      .catch(() => {
        /* 失败隐藏，不影响进入 */
      })
    libraryApi
      .albums(0, 1)
      .then((r) => {
        if (!cancelled) setAlbumCount(r.total)
      })
      .catch(() => {
        /* 失败隐藏，不影响进入 */
      })
    return () => {
      cancelled = true
    }
  }, [dataVersion])

  return (
    <div className="p-8 pb-28">
      {/* 欢迎条 */}
      <div className="flex items-center gap-4">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
            ?
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-neutral-50">
            {user?.nickname || '未登录'}
          </h1>
          <p className="mt-1 truncate text-sm text-neutral-500">
            {user?.signature || '欢迎回来，今天也静静听歌'}
          </p>
        </div>
      </div>

      {/* 概览：异步补数，失败隐藏 */}
      {(likesCount != null || playlistCount != null || albumCount != null) && (
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-neutral-400">
          {likesCount != null && (
            <span>
              我喜欢 <span className="font-semibold text-neutral-100">{likesCount}</span> 首
            </span>
          )}
          {playlistCount != null && (
            <span>
              我的歌单 <span className="font-semibold text-neutral-100">{playlistCount}</span> 个
            </span>
          )}
          {albumCount != null && (
            <span>
              收藏专辑 <span className="font-semibold text-neutral-100">{albumCount}</span> 张
            </span>
          )}
        </div>
      )}

      {/* 模块入口 ×5 */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ENTRIES.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 transition hover:border-accent/40 hover:bg-neutral-900"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-xl text-accent-soft">
                {c.icon}
              </div>
              <div className="text-lg font-semibold text-neutral-100 group-hover:text-accent-soft">
                {c.title}
              </div>
            </div>
            <div className="mt-3 text-sm text-neutral-500">{c.desc}</div>
          </Link>
        ))}
      </div>

    </div>
  )
}
