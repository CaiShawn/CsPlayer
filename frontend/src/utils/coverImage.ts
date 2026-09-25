/**
 * 封面图片像素获取唯一入口（v0.1.8 S1 分享卡片用）。
 *
 * S1-1 实测（2026-09-25）：网易云封面 CDN 返回 `Access-Control-Allow-Origin: *`，
 * `crossOrigin='anonymous'` 直连即可读出像素（docs/archived/V0.1.8_DESIGN.md §1.3）。
 * 若后续引入代理或 v0.2.0 迁移调整获取方式，只改本模块。
 *
 * 模块级缓存（含失败负缓存）：同一 URL 会话内只加载一次；
 * 失败 resolve(null) 而非 reject——调用方（卡片渲染）降级占位，永不硬失败。
 */

const cache = new Map<string, Promise<HTMLImageElement | null>>()

export function loadCoverImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  let p = cache.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    cache.set(url, p)
  }
  return p
}
