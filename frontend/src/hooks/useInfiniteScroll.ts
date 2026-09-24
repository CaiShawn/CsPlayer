import { useEffect, useRef } from 'react'

/** 滚到底自动加载（v0.1.7 分批加载）：哨兵进入视口（提前 200px）触发 onLoadMore。
 *
 *  enabled 由调用方传 `hasMore && !loading && !loadMoreError` —— 加载期间观察器
 *  断开，加载完成后重建并立即重新判定可见性：哨兵仍在视口内则继续触发，形成
 *  连续加载链；内容增高把哨兵顶出视口后自然停在当前批次，等下一次滚动到底。
 *  失败断链契约：加载失败时调用方必须让 enabled 留在 false（如置 loadMoreError）
 *  直到用户手动重试，否则重建观察器会立即重发（2026-09 401 风暴根因）。
 */
export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const cbRef = useRef(onLoadMore)
  cbRef.current = onLoadMore

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cbRef.current()
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled])

  return ref
}
