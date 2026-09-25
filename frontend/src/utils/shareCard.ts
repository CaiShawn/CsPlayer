/**
 * 分享卡片渲染（v0.1.8 S1，设计 docs/V0.1.8_DESIGN.md §1）。
 *
 * 手绘 canvas 2D（零依赖），三种比例共用同一参数化布局：
 * 大封面 + 类型徽标 + 标题（≤2 行省略）+ 副题 + 元信息 + 底部落款；
 * 徽标 / 径向渐变 / 落款圆点三处使用主题 accent，其余中性色。
 *
 * 本模块纯渲染，不 import 任何 store——accent hex 由调用方从 settingsStore 派生；
 * 封面像素经 utils/coverImage.ts 获取（失败 → 占位样式，卡片永不因封面硬失败）。
 */
import type {
  AlbumBrief,
  AlbumDetail,
  PlaylistBrief,
  PlaylistDetail,
  SongSummary,
} from '../types'
import { artistNames, formatDuration } from './format'

/* ------------------------------------------------------------------------
 * 类型与常量
 * --------------------------------------------------------------------- */

export type ShareCardKind = 'song' | 'album' | 'playlist'

/** 弹窗入参：直接携带现有 target 数据（Brief 即可起卡片；专辑缺曲目数时补拉详情） */
/** 专辑卡片所需最小结构（专辑页内联裁剪态 / AlbumDetail 均可赋值） */
type AlbumCardData = Pick<AlbumDetail, 'id' | 'name' | 'coverUrl' | 'artistName' | 'tracks'>

export type ShareCardSource =
  | { kind: 'song'; song: SongSummary }
  | { kind: 'album'; album: AlbumBrief | AlbumCardData }
  | { kind: 'playlist'; playlist: PlaylistBrief | PlaylistDetail }

export interface ShareCardSpec {
  kind: ShareCardKind
  title: string
  subtitle: string
  meta: string
  coverUrl: string
  /** 主题 accent（#rrggbb），由调用方派生 */
  accentHex: string
}

/** 导出基准像素（1080 宽） */
export const SHARE_CARD_SIZES = {
  '1:1': { w: 1080, h: 1080 },
  '3:4': { w: 1080, h: 1440 },
  '9:16': { w: 1080, h: 1920 },
} as const

export type ShareCardRatio = keyof typeof SHARE_CARD_SIZES

export const SHARE_CARD_RATIOS = Object.keys(SHARE_CARD_SIZES) as ShareCardRatio[]

const KIND_LABEL: Record<ShareCardKind, string> = {
  song: '单曲',
  album: '专辑',
  playlist: '歌单',
}

const FONT_STACK = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'

/* ------------------------------------------------------------------------
 * Spec 构建（数据全部来自现有 target 字段；仅专辑 Brief 缺曲目数时需先拉详情）
 * --------------------------------------------------------------------- */

export function buildShareCardSpec(source: ShareCardSource, accentHex: string): ShareCardSpec | null {
  if (source.kind === 'song') {
    const { song } = source
    const meta = [song.albumName, formatDuration(song.durationMs)].filter(Boolean).join(' · ')
    return {
      kind: 'song',
      title: song.name,
      subtitle: artistNames(song.artists),
      meta,
      coverUrl: song.coverUrl,
      accentHex,
    }
  }
  if (source.kind === 'playlist') {
    const p = source.playlist
    return {
      kind: 'playlist',
      title: p.name,
      subtitle: p.creatorName || '歌单',
      meta: `${p.trackCount} 首`,
      coverUrl: p.coverUrl,
      accentHex,
    }
  }
  // 专辑：Brief 无曲目数据 → 返回 null，调用方补拉详情后走 albumSpecFromDetail
  if ('tracks' in source.album) return albumSpecFromDetail(source.album, accentHex)
  return null
}

export function albumSpecFromDetail(detail: AlbumCardData, accentHex: string): ShareCardSpec {
  const totalMs = detail.tracks.reduce((sum, t) => sum + (t.durationMs || 0), 0)
  return {
    kind: 'album',
    title: detail.name,
    subtitle: detail.artistName,
    meta: `${detail.tracks.length} 首 · ${formatTotalDuration(totalMs)}`,
    coverUrl: detail.coverUrl,
    accentHex,
  }
}

/** 超过 1h 用 h:mm:ss，否则 m:ss（formatDuration 的 m:ss 封顶不够用） */
function formatTotalDuration(ms: number): string {
  if (!ms || ms < 0) return '0:00'
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Windows 非法文件名字符清洗（设计 §1.3 导出流程） */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '分享卡片'
}

/* ------------------------------------------------------------------------
 * 渲染
 * --------------------------------------------------------------------- */

const PAGE_PAD = 72
const FOOTER_ZONE = 64
const COVER_GAP = 56

/** 文本块高度（徽标 + 标题 lines 行 + 副题 + 元信息） */
function textBlockHeight(titleLines: number): number {
  return 44 + 36 + titleLines * 66 + 22 + 40 + 18 + 36
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 单行省略（基于实测宽度，适配 CJK / 拉丁混排） */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) {
    t = Array.from(t).slice(0, -1).join('')
  }
  return `${t}…`
}

/** CJK 逐字断行 + 行尾空格回退 + 末行省略；返回最多 maxLines 行 */
function wrapWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  if (!text) return []
  const lines: string[] = []
  let rest = text
  for (let i = 0; i < maxLines && rest; i++) {
    if (ctx.measureText(rest).width <= maxW) {
      lines.push(rest)
      break
    }
    if (i === maxLines - 1) {
      lines.push(ellipsize(ctx, rest, maxW))
      break
    }
    let w = 0
    let cut = rest.length
    const chars = Array.from(rest)
    for (let j = 0; j < chars.length; j++) {
      w += ctx.measureText(chars[j]).width
      if (w > maxW) {
        cut = j
        break
      }
    }
    let head = chars.slice(0, cut).join('')
    // 拉丁词尽量不腰斩：断点附近有空格则退到空格后
    const sp = head.lastIndexOf(' ')
    if (cut > 0 && sp > head.length * 0.6) head = head.slice(0, sp + 1)
    lines.push(head)
    rest = rest.slice(head.length)
  }
  return lines
}

/**
 * 把卡片渲染到 canvas。
 * scale：1 = 导出原始尺寸；预览传 (显示宽 × dpr) / 1080。
 */
export function renderShareCard(
  canvas: HTMLCanvasElement,
  spec: ShareCardSpec,
  ratio: ShareCardRatio,
  cover: HTMLImageElement | null,
  scale = 1,
): void {
  const { w: W, h: H } = SHARE_CARD_SIZES[ratio]
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  const [ar, ag, ab] = hexToRgb(spec.accentHex)

  // 底色 + accent 径向渐变（主题感）
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, W, H)

  // 布局：封面尺寸先按上限，再按「最坏 2 行标题 + 页边 + 落款」自适应收缩
  const maxContentH = H - 2 * PAGE_PAD - FOOTER_ZONE
  let coverSize = Math.min(W - 2 * PAGE_PAD, Math.round(H * 0.55))
  while (coverSize + COVER_GAP + textBlockHeight(2) > maxContentH && coverSize > W * 0.38) {
    coverSize -= 8
  }

  ctx.font = `700 50px ${FONT_STACK}`
  const titleLines = wrapWithEllipsis(ctx, spec.title, W - 2 * PAGE_PAD, 2)
  const blockH = coverSize + COVER_GAP + textBlockHeight(titleLines.length)
  const top = Math.max(PAGE_PAD, Math.round((H - FOOTER_ZONE - blockH) / 2))
  const coverX = Math.round((W - coverSize) / 2)
  const coverY = top

  const grad = ctx.createRadialGradient(W / 2, coverY + coverSize * 0.35, 0, W / 2, coverY + coverSize * 0.35, W * 0.75)
  grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.10)`)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 封面（object-fit cover 中心裁方）或占位
  roundRectPath(ctx, coverX, coverY, coverSize, coverSize, 28)
  ctx.save()
  ctx.clip()
  if (cover) {
    const iw = cover.naturalWidth
    const ih = cover.naturalHeight
    const side = Math.min(iw, ih)
    ctx.drawImage(
      cover,
      (iw - side) / 2,
      (ih - side) / 2,
      side,
      side,
      coverX,
      coverY,
      coverSize,
      coverSize,
    )
  } else {
    ctx.fillStyle = '#262626'
    ctx.fillRect(coverX, coverY, coverSize, coverSize)
    ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.45)`
    ctx.font = `400 ${Math.round(coverSize * 0.28)}px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', W / 2, coverY + coverSize / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  const maxTextW = W - 2 * PAGE_PAD
  let y = coverY + coverSize + COVER_GAP

  // 类型徽标（accent 底 + 深色字）
  ctx.font = `600 26px ${FONT_STACK}`
  const badgeText = KIND_LABEL[spec.kind]
  const badgeW = Math.round(ctx.measureText(badgeText).width) + 52
  roundRectPath(ctx, PAGE_PAD, y, badgeW, 44, 22)
  ctx.fillStyle = spec.accentHex
  ctx.fill()
  ctx.fillStyle = '#0a0a0a'
  ctx.textBaseline = 'middle'
  ctx.fillText(badgeText, PAGE_PAD + 26, y + 23)
  ctx.textBaseline = 'alphabetic'
  y += 44 + 36

  // 标题（≤2 行）
  ctx.font = `700 50px ${FONT_STACK}`
  ctx.fillStyle = '#fafafa'
  titleLines.forEach((line, i) => {
    ctx.fillText(line, PAGE_PAD, y + 66 * i + 50)
  })
  y += titleLines.length * 66 + 22

  // 副题
  ctx.font = `400 30px ${FONT_STACK}`
  ctx.fillStyle = '#d4d4d4'
  ctx.fillText(ellipsize(ctx, spec.subtitle, maxTextW), PAGE_PAD, y + 30)
  y += 40 + 18

  // 元信息
  ctx.font = `400 27px ${FONT_STACK}`
  ctx.fillStyle = '#a3a3a3'
  ctx.fillText(ellipsize(ctx, spec.meta, maxTextW), PAGE_PAD, y + 26)

  // 底部落款（固定贴底）
  const footerY = H - FOOTER_ZONE + (FOOTER_ZONE - 34) / 2 + 17
  ctx.fillStyle = spec.accentHex
  ctx.beginPath()
  ctx.arc(PAGE_PAD + 7, footerY - 9, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `400 26px ${FONT_STACK}`
  ctx.fillStyle = '#737373'
  ctx.fillText('CsPlayer · 你的网易云，本该这么安静', PAGE_PAD + 30, footerY)
}

/* ------------------------------------------------------------------------
 * 导出
 * --------------------------------------------------------------------- */

/** 离屏渲染 → PNG Blob（scale=1 基准尺寸） */
export function exportShareCardPng(
  spec: ShareCardSpec,
  ratio: ShareCardRatio,
  cover: HTMLImageElement | null,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  renderShareCard(canvas, spec, ratio, cover, 1)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
