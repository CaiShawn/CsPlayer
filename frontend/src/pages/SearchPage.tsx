import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PAGE_SIZE, searchApi } from '../api'
import type {
  AlbumBrief,
  ArtistBrief,
  PlaylistBrief,
  SearchType,
  SongSummary,
} from '../types'
import { Cover } from '../components/common/Cover'
import { Empty, LoadError, Loading } from '../components/common/Ui'
import { SongTable } from '../components/media/SongTable'
import { useContextMenuStore } from '../stores/contextMenuStore'
import { usePlayerStore } from '../stores/playerStore'

/** 本次会话记忆 Tab */
const TAB_KEY = 'csplayer:searchTab'

const TABS: { id: SearchType; label: string }[] = [
  { id: 'song', label: '单曲' },
  { id: 'album', label: '专辑' },
  { id: 'artist', label: '歌手' },
  { id: 'playlist', label: '歌单' },
]

type SearchItem = SongSummary | AlbumBrief | ArtistBrief | PlaylistBrief

function readTab(): SearchType {
  try {
    const raw = sessionStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.id === raw) ? (raw as SearchType) : 'song'
  } catch {
    return 'song'
  }
}

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q')?.trim() ?? ''
  const [tab, setTab] = useState<SearchType>(readTab)
  const [items, setItems] = useState<SearchItem[]>([])
  /** items 归属的 Tab：切换 Tab 后旧数据形状不匹配，未加载完成前不渲染 */
  const [itemsTab, setItemsTab] = useState<SearchType | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const reqId = useRef(0)

  const currentId = usePlayerStore((s) =>
    s.currentIndex >= 0 ? s.queue[s.currentIndex]?.id : undefined,
  )
  const playing = usePlayerStore((s) => s.playing)

  const load = useCallback(
    async (kw: string, type: SearchType, offset: number, replace: boolean) => {
      const id = ++reqId.current
      if (replace) {
        setItemsTab(type)
        setLoading(true)
        setError('')
      } else {
        setLoadingMore(true)
      }
      try {
        const data = await searchApi.search<SearchItem>(kw, type, PAGE_SIZE, offset)
        if (id !== reqId.current) return
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]))
        setTotal(data.total)
        setHasMore(data.hasMore)
      } catch (e) {
        if (id !== reqId.current) return
        if (replace) {
          setItems([])
          setTotal(0)
          setHasMore(false)
          setError(e instanceof Error ? e.message : '搜索失败')
        }
      } finally {
        if (id === reqId.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, tab)
    } catch {
      // ignore
    }
  }, [tab])

  // 关键字（URL）或 Tab 变化 → 重新搜索
  useEffect(() => {
    if (!q) {
      reqId.current++
      setItems([])
      setItemsTab(null)
      setTotal(0)
      setHasMore(false)
      setError('')
      setLoading(false)
      setLoadingMore(false)
      return
    }
    void load(q, tab, 0, true)
  }, [q, tab, load])

  const songList = items as SongSummary[]

  const playAll = () => {
    const playable = songList.filter((t) => t.playable)
    if (playable.length) usePlayerStore.getState().playSongs(playable, 0, '搜索结果')
  }

  const onPlay = (index: number) => {
    const playable = songList.filter((t) => t.playable)
    const song = songList[index]
    if (!song?.playable) return
    const start = playable.findIndex((t) => t.id === song.id)
    usePlayerStore.getState().playSongs(playable, Math.max(0, start), '搜索结果')
  }

  const showEmpty = !!q && !loading && !error && items.length === 0

  return (
    <div className="p-8 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-neutral-50">搜索</h1>
          <p className="mt-1 truncate text-sm text-neutral-500">
            {q ? (
              <>
                「<span className="text-neutral-300">{q}</span>」
                {total > 0 ? ` · 共 ${total} 条结果` : ''}
              </>
            ) : (
              '输入关键字搜索歌曲、专辑、歌手或歌单'
            )}
          </p>
        </div>
        {tab === 'song' && q && (
          <button
            type="button"
            onClick={playAll}
            disabled={!songList.some((t) => t.playable)}
            className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-accent-hover disabled:opacity-40"
          >
            ▶ 播放全部
          </button>
        )}
      </div>

      <div className="mt-5 flex gap-1 border-b border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.id
                ? 'border-accent text-accent-soft'
                : 'border-transparent text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {!q ? (
          <Empty text="输入关键字开始搜索（Enter 提交）" />
        ) : loading || itemsTab !== tab ? (
          <Loading text="搜索中…" />
        ) : error ? (
          <LoadError message={error} onRetry={() => void load(q, tab, 0, true)} />
        ) : showEmpty ? (
          <Empty text={`未找到与「${q}」相关的结果`} />
        ) : tab === 'song' ? (
          <SongTable
            tracks={songList}
            currentId={currentId}
            playing={playing}
            onPlay={onPlay}
            titleMaxWidth={235}
            durationWidth={69}
          />
        ) : tab === 'album' ? (
          <CardGrid>
            {(items as AlbumBrief[]).map((a) => (
              <Link
                key={a.id}
                to={`/album/${a.id}`}
                onContextMenu={(e) =>
                  useContextMenuStore.getState().openForEvent(e, { kind: 'album', album: a })
                }
                className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
              >
                <Cover url={a.coverUrl} className="aspect-square w-full" />
                <div className="mt-2 truncate text-sm text-neutral-100">{a.name}</div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">{a.artistName}</div>
              </Link>
            ))}
          </CardGrid>
        ) : tab === 'artist' ? (
          <CardGrid>
            {(items as ArtistBrief[]).map((a) => (
              <Link
                key={a.id}
                to={`/artist/${a.id}`}
                className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
              >
                <div className="aspect-square w-full overflow-hidden rounded-full bg-neutral-800">
                  {a.avatarUrl ? (
                    <img
                      src={a.avatarUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-600">
                      ♪
                    </div>
                  )}
                </div>
                <div className="mt-2 truncate text-center text-sm text-neutral-100">{a.name}</div>
                <div className="mt-0.5 truncate text-center text-xs text-neutral-500">
                  {a.alias || `歌曲 ${a.musicSize}`}
                </div>
              </Link>
            ))}
          </CardGrid>
        ) : (
          <CardGrid>
            {(items as PlaylistBrief[]).map((p) => (
              <Link
                key={p.id}
                to={`/playlist/${p.id}`}
                onContextMenu={(e) =>
                  useContextMenuStore.getState().openForEvent(e, {
                    kind: 'playlist',
                    playlist: p,
                  })
                }
                className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
              >
                <Cover url={p.coverUrl} className="aspect-square w-full" />
                <div className="mt-2 truncate text-sm text-neutral-100">{p.name}</div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {p.trackCount} 首{p.creatorName ? ` · ${p.creatorName}` : ''}
                </div>
              </Link>
            ))}
          </CardGrid>
        )}

        {!!q && !loading && !error && items.length > 0 && hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => void load(q, tab, items.length, false)}
              disabled={loadingMore}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-6 py-2 text-sm text-neutral-200 hover:border-accent/50 hover:text-accent-soft disabled:opacity-50"
            >
              {loadingMore ? '加载中…' : '加载更多'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  )
}
