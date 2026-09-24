import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { libraryApi } from '../api'
import type { PlaylistBrief } from '../types'
import { Cover } from '../components/common/Cover'
import { CardGridSkeleton, Empty, ErrorBar } from '../components/common/Ui'
import { useAuthStore } from '../stores/authStore'
import { useContextMenuStore } from '../stores/contextMenuStore'

interface LibraryData {
  created: PlaylistBrief[]
  subscribed: PlaylistBrief[]
}

/** SWR 内存快照（§4.3 a）：二次进入立即渲染缓存内容（<100ms），后台静默刷新；
 *  按 authStore.dataVersion 归属，切账号不串数据。
 *  v0.1.7：收藏的专辑改由唱片架展示（滚动分批加载），音乐库只留跳转入口，
 *  不再重复加载专辑。 */
let snapshot: { version: number; data: LibraryData } | null = null

export function LibraryPage() {
  const dataVersion = useAuthStore((s) => s.dataVersion)
  const cached = snapshot?.version === dataVersion ? snapshot.data : null
  const [data, setData] = useState<LibraryData | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState('')
  const [reloadTick, setReloadTick] = useState(0)

  const load = useCallback(async () => {
    const warm = snapshot?.version === dataVersion ? snapshot.data : null
    // SWR：有缓存先显缓存（静默刷新）；无缓存/切账号 → 骨架屏
    if (warm) setData(warm)
    else {
      setData(null)
      setLoading(true)
    }
    setError('')
    try {
      const pl = await libraryApi.playlists()
      const next: LibraryData = {
        created: pl.created || [],
        subscribed: pl.subscribed || [],
      }
      snapshot = { version: dataVersion, data: next }
      setData(next)
      setError('')
    } catch (e) {
      // SWR：失败保留上次缓存（若有），由顶部错误条提示 + 重试
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [dataVersion])

  useEffect(() => {
    void load()
  }, [load, reloadTick])

  if (loading) return <LibrarySkeleton />
  if (!data) {
    return (
      <div className="p-8">
        <ErrorBar
          message={error || '加载失败'}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-10 p-8 pb-28">
      {error && (
        <ErrorBar
          message={`${error}（当前显示的是上次缓存内容）`}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      )}
      <Section title="我创建的歌单">
        {data.created.length === 0 ? (
          <Empty text="暂无创建的歌单" />
        ) : (
          <CardGrid>
            {data.created.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </CardGrid>
        )}
      </Section>

      <Section title="我收藏的歌单">
        {data.subscribed.length === 0 ? (
          <Empty text="暂无收藏的歌单" />
        ) : (
          <CardGrid>
            {data.subscribed.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </CardGrid>
        )}
      </Section>

      {/* 收藏的专辑统一在唱片架展示（滚动分批加载），这里只留跳转入口 */}
      <Section title="收藏的专辑">
        <CardGrid>
          <ShelfLinkCard />
        </CardGrid>
      </Section>
    </div>
  )
}

/** 冷加载骨架屏：三节布局与真实内容一致，首屏即刻可交互（§4.3 a） */
function LibrarySkeleton() {
  return (
    <div className="space-y-10 p-8 pb-28">
      {[0, 1, 2].map((i) => (
        <section key={i}>
          <div className="mb-4 h-5 w-28 animate-pulse rounded bg-neutral-800" />
          <CardGridSkeleton count={5} />
        </section>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-neutral-100">{title}</h2>
      {children}
    </section>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--space-card-gap)] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  )
}

function PlaylistCard({ playlist }: { playlist: PlaylistBrief }) {
  return (
    <Link
      to={`/playlist/${playlist.id}`}
      onContextMenu={(e) =>
        useContextMenuStore.getState().openForEvent(e, { kind: 'playlist', playlist })
      }
      className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
    >
      <Cover url={playlist.coverUrl} className="aspect-square w-full" />
      <div className="mt-2 truncate text-sm text-neutral-100">{playlist.name}</div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {playlist.trackCount} 首
        {playlist.subscribed ? ` · ${playlist.creatorName}` : ''}
      </div>
    </Link>
  )
}

/** 「收藏的专辑」入口卡：点击跳唱片架（专辑在那边分批加载，不在此重复请求） */
function ShelfLinkCard() {
  return (
    <Link
      to="/shelf"
      className="group rounded-[var(--radius-cover)] border border-transparent bg-neutral-900/40 p-3 transition hover:border-neutral-800 hover:bg-neutral-900"
    >
      <div className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-cover)] bg-neutral-800/70 text-4xl text-neutral-500 transition group-hover:text-accent-soft">
        ♫
      </div>
      <div className="mt-2 truncate text-sm text-neutral-100">查看全部收藏专辑</div>
      <div className="mt-0.5 text-xs text-neutral-500">前往唱片架 →</div>
    </Link>
  )
}
