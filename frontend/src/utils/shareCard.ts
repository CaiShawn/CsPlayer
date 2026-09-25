/**
 * 分享卡片渲染（v0.1.8 S1，设计 docs/V0.1.8_DESIGN.md §1）。
 *
 * 手绘 canvas 2D（零依赖），五档比例（1:1 / 3:4 / 9:16 / 4:3 / 16:9）：
 * 竖版单栏（封面在上）、横版双栏（封面左 + 文案右），同一文本栈绘制器；
 * 主题 accent 用在三处结构点（徽标 / 评论竖线 / 落款圆点）+ 背景渐变，
 * 其余中性色。细节精修：封面投影 + 微描边、标题字距、元信息前置分隔点。
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
  /** 个人评论（可选，弹窗输入，渲染在副题与元信息之间；空 = 不占位） */
  comment?: string
}

/** 导出基准像素（竖版 1080 宽、横版 1080 高） */
export const SHARE_CARD_SIZES = {
  '1:1': { w: 1080, h: 1080 },
  '3:4': { w: 1080, h: 1440 },
  '9:16': { w: 1080, h: 1920 },
  '4:3': { w: 1440, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
} as const

export type ShareCardRatio = keyof typeof SHARE_CARD_SIZES

/** 展示顺序：方 → 竖 → 横 → 长 */
export const SHARE_CARD_RATIOS: ShareCardRatio[] = ['1:1', '3:4', '9:16', '4:3', '16:9']

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

const PAGE_PAD = 72 // 竖版页边
const H_PAGE_PAD = 88 // 横版页边
const FOOTER_ZONE = 64
const COVER_GAP = 56 // 竖版封面-文字间距
const H_TEXT_GAP = 72 // 横版封面-文案列间距

/** 字号体系：竖 / 横两套（font 字符串不含字体栈） */
interface Fonts {
  badge: string
  title: string
  titleLh: number
  titleMax: number
  subtitle: string
  subtitleLh: number
  comment: string
  commentLh: number
  commentMax: number
  meta: string
}

const V_FONTS: Fonts = {
  badge: '600 26px',
  title: '700 50px',
  titleLh: 66,
  titleMax: 2,
  subtitle: '400 30px',
  subtitleLh: 40,
  comment: '400 28px',
  commentLh: 42,
  commentMax: 2,
  meta: '400 27px',
}

const H_FONTS: Fonts = {
  badge: '600 26px',
  title: '700 54px',
  titleLh: 72,
  titleMax: 2,
  subtitle: '400 32px',
  subtitleLh: 44,
  comment: '400 28px',
  commentLh: 42,
  commentMax: 2,
  meta: '400 28px',
}

function pxOf(font: string): number {
  return Number(font.match(/(\d+)px$/)?.[1] ?? 0)
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

/** 标题字距（新内核生效，旧内核忽略） */
function setLetterSpacing(ctx: CanvasRenderingContext2D, v: string) {
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = v
  } catch {
    // ignore
  }
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

/** 文本栈度量：标题 / 评论断行结果（调用后字体状态会被改写） */
function measureStack(ctx: CanvasRenderingContext2D, spec: ShareCardSpec, maxW: number, f: Fonts) {
  ctx.font = `${f.title} ${FONT_STACK}`
  const titleLines = wrapWithEllipsis(ctx, spec.title, maxW, f.titleMax)
  const comment = (spec.comment ?? '').trim()
  let commentLines: string[] = []
  if (comment) {
    ctx.font = `${f.comment} ${FONT_STACK}`
    commentLines = wrapWithEllipsis(ctx, comment, maxW - 20, f.commentMax) // 竖线 5px + 间距 15px
  }
  return { titleLines, commentLines }
}

/** 文本栈总高（徽标 + 标题 + 副题 + 评论? + 元信息） */
function stackHeight(f: Fonts, titleLines: number, commentLines: number): number {
  let h = 44 + 36 + titleLines * f.titleLh + 22 + f.subtitleLh
  if (commentLines > 0) h += 20 + commentLines * f.commentLh + 22
  return h + 36
}

/**
 * 文本栈绘制（徽标 → 标题 → 副题 → 评论? → 元信息），返回实际占用高度。
 * 评论为引用体：accent 竖线 + 浅色文字；元信息前置 accent 分隔点。
 */
function drawStack(
  ctx: CanvasRenderingContext2D,
  spec: ShareCardSpec,
  x: number,
  y: number,
  maxW: number,
  f: Fonts,
  m: { titleLines: string[]; commentLines: string[] },
): number {
  const start = y
  // 徽标（accent 底 + 深色字）
  ctx.font = `${f.badge} ${FONT_STACK}`
  const badgeW = Math.round(ctx.measureText(KIND_LABEL[spec.kind]).width) + 52
  roundRectPath(ctx, x, y, badgeW, 44, 22)
  ctx.fillStyle = spec.accentHex
  ctx.fill()
  ctx.fillStyle = '#0a0a0a'
  ctx.textBaseline = 'middle'
  ctx.fillText(KIND_LABEL[spec.kind], x + 26, y + 23)
  ctx.textBaseline = 'alphabetic'
  y += 44 + 36

  // 标题（精修：1px 字距）
  ctx.font = `${f.title} ${FONT_STACK}`
  setLetterSpacing(ctx, '1px')
  ctx.fillStyle = '#fafafa'
  m.titleLines.forEach((line, i) => {
    ctx.fillText(line, x, y + f.titleLh * i + pxOf(f.title))
  })
  setLetterSpacing(ctx, '0px')
  y += m.titleLines.length * f.titleLh + 22

  // 副题
  ctx.font = `${f.subtitle} ${FONT_STACK}`
  ctx.fillStyle = '#d4d4d4'
  ctx.fillText(ellipsize(ctx, spec.subtitle, maxW), x, y + pxOf(f.subtitle))
  y += f.subtitleLh

  // 个人评论（引用体：accent 竖线 + 浅色文字）
  if (m.commentLines.length) {
    y += 20
    const barH = m.commentLines.length * f.commentLh - 8
    roundRectPath(ctx, x, y, 5, barH, 2.5)
    ctx.fillStyle = spec.accentHex
    ctx.fill()
    ctx.font = `${f.comment} ${FONT_STACK}`
    ctx.fillStyle = '#e5e5e5'
    m.commentLines.forEach((line, i) => {
      ctx.fillText(line, x + 20, y + f.commentLh * i + pxOf(f.comment))
    })
    y += m.commentLines.length * f.commentLh + 22
  }

  // 元信息（前置 accent 分隔点）
  ctx.fillStyle = spec.accentHex
  ctx.beginPath()
  ctx.arc(x + 4, y + 22, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `${f.meta} ${FONT_STACK}`
  ctx.fillStyle = '#a3a3a3'
  ctx.fillText(ellipsize(ctx, spec.meta, maxW - 18), x + 18, y + 26)
  y += 36

  return y - start
}

/** 海报底：对角线性渐变 + accent 双径向（封面中心 + 右下角极淡） */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cx: number,
  cy: number,
  rgb: [number, number, number],
) {
  const lin = ctx.createLinearGradient(0, 0, W, H)
  lin.addColorStop(0, '#141414')
  lin.addColorStop(1, '#0a0a0a')
  ctx.fillStyle = lin
  ctx.fillRect(0, 0, W, H)
  const [ar, ag, ab] = rgb
  const r1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.45)
  r1.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.12)`)
  r1.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = r1
  ctx.fillRect(0, 0, W, H)
  const r2 = ctx.createRadialGradient(W, H, 0, W, H, W * 0.35)
  r2.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.05)`)
  r2.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = r2
  ctx.fillRect(0, 0, W, H)
}

/** 封面：柔和投影（圆角矩形预投）→ 中心裁方贴图 → 1px 微描边；无图出占位 */
function drawCover(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, cover: HTMLImageElement | null, rgb: [number, number, number]) {
  const R = 28
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = size * 0.06
  ctx.shadowOffsetY = size * 0.02
  ctx.fillStyle = '#0f0f0f'
  roundRectPath(ctx, x, y, size, size, R)
  ctx.fill()
  ctx.restore()

  roundRectPath(ctx, x, y, size, size, R)
  ctx.save()
  ctx.clip()
  if (cover) {
    const iw = cover.naturalWidth
    const ih = cover.naturalHeight
    const side = Math.min(iw, ih)
    ctx.drawImage(cover, (iw - side) / 2, (ih - side) / 2, side, side, x, y, size, size)
  } else {
    ctx.fillStyle = '#262626'
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.45)`
    ctx.font = `400 ${Math.round(size * 0.28)}px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', x + size / 2, y + size / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  roundRectPath(ctx, x, y, size, size, R)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/** 底部落款（固定贴底）：accent 圆点 + 品牌行 */
function drawFooter(ctx: CanvasRenderingContext2D, H: number, pad: number, accentHex: string) {
  const baseline = H - FOOTER_ZONE + (FOOTER_ZONE - 34) / 2 + 17
  ctx.fillStyle = accentHex
  ctx.beginPath()
  ctx.arc(pad + 7, baseline - 9, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `400 26px ${FONT_STACK}`
  ctx.fillStyle = '#737373'
  ctx.fillText('CsPlayer · 你的网易云，本该这么安静', pad + 30, baseline)
}

/**
 * 把卡片渲染到 canvas。
 * scale：1 = 导出原始尺寸；预览传（显示宽 × dpr）/ 版式宽。
 * 竖版（h ≥ w）：单栏，封面在上、文案在下，内容块垂直居中；
 * 横版（w > h）：双栏，封面左、文案右垂直居中，共用同一文本栈。
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
  const rgb = hexToRgb(spec.accentHex)
  const horizontal = W > H
  const f = horizontal ? H_FONTS : V_FONTS

  let coverX: number
  let coverY: number
  let coverSize: number
  let textX: number
  let textTop: number
  let maxTextW: number

  if (horizontal) {
    // 双栏：封面占高（扣除页边与落款区）且不超过版面宽 40%，文案列垂直居中
    coverSize = Math.min(H - 2 * H_PAGE_PAD - FOOTER_ZONE, Math.round(W * 0.4))
    coverX = H_PAGE_PAD
    coverY = Math.round((H - FOOTER_ZONE - coverSize) / 2)
    textX = H_PAGE_PAD + coverSize + H_TEXT_GAP
    maxTextW = W - textX - H_PAGE_PAD
    const m = measureStack(ctx, spec, maxTextW, f)
    const sh = stackHeight(f, m.titleLines.length, m.commentLines.length)
    textTop = coverY + Math.max(0, Math.round((coverSize - sh) / 2))
    drawBackground(ctx, W, H, coverX + coverSize / 2, coverY + coverSize / 2, rgb)
    drawCover(ctx, coverX, coverY, coverSize, cover, rgb)
    drawStack(ctx, spec, textX, textTop, maxTextW, f, m)
  } else {
    // 单栏：封面先按上限，再按「最坏 2 行标题 + 评论 + 页边 + 落款」逐档收缩
    maxTextW = W - 2 * PAGE_PAD
    const m = measureStack(ctx, spec, maxTextW, f)
    const maxContentH = H - 2 * PAGE_PAD - FOOTER_ZONE
    coverSize = Math.min(W - 2 * PAGE_PAD, Math.round(H * 0.55))
    while (
      coverSize + COVER_GAP + stackHeight(f, f.titleMax, m.commentLines.length) > maxContentH &&
      coverSize > W * 0.38
    ) {
      coverSize -= 8
    }
    const blockH = coverSize + COVER_GAP + stackHeight(f, m.titleLines.length, m.commentLines.length)
    coverX = Math.round((W - coverSize) / 2)
    coverY = Math.max(PAGE_PAD, Math.round((H - FOOTER_ZONE - blockH) / 2))
    textX = PAGE_PAD
    textTop = coverY + coverSize + COVER_GAP
    drawBackground(ctx, W, H, W / 2, coverY + coverSize * 0.35, rgb)
    drawCover(ctx, coverX, coverY, coverSize, cover, rgb)
    drawStack(ctx, spec, textX, textTop, maxTextW, f, m)
  }

  drawFooter(ctx, H, horizontal ? H_PAGE_PAD : PAGE_PAD, spec.accentHex)
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
