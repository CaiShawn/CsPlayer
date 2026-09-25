/**
 * 分享卡片渲染（v0.1.8 S1，设计 docs/V0.1.8_DESIGN.md §1）。
 *
 * 手绘 canvas 2D（零依赖），五档比例（1:1 / 3:4 / 9:16 / 4:3 / 16:9）：
 * 竖版单栏（封面在上）、横版双栏（封面左 + 文案右），同一文本栈绘制器；
 * 主题 accent 用在两处结构点（徽标 / 评论竖线）+ 背景渐变，
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

export type ShareCardKind = 'song' | 'album' | 'playlist' | 'collage'

/** 弹窗入参：直接携带现有 target 数据（Brief 即可起卡片；专辑缺曲目数时补拉详情） */
/** 专辑卡片所需最小结构（专辑页内联裁剪态 / AlbumDetail 均可赋值） */
type AlbumCardData = Pick<AlbumDetail, 'id' | 'name' | 'coverUrl' | 'artistName' | 'tracks'>

export type ShareCardSource =
  | { kind: 'song'; song: SongSummary }
  | { kind: 'album'; album: AlbumBrief | AlbumCardData }
  | { kind: 'playlist'; playlist: PlaylistBrief | PlaylistDetail }
  | { kind: 'collage'; albums: AlbumBrief[] } // 唱片架拼贴卡（S2）：选中 2–6 张专辑

export interface ShareCardSpec {
  kind: ShareCardKind
  title: string
  subtitle: string
  meta: string
  coverUrl: string
  /** 主题 accent（#rrggbb），由调用方派生（弹窗内可临时切换） */
  accentHex: string
  /** 个人评论（可选，弹窗输入，固定渲染在卡片底部原落款行位置；空 = 不占位） */
  comment?: string
  /** 背景样式：渐变海报底（默认）/ 纯色 */
  bgStyle?: 'gradient' | 'solid'
  /** 拼贴卡（kind='collage'）：参与拼贴的封面 URL 列表 */
  collageCovers?: string[]
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
  collage: '唱片架',
}

const FONT_STACK = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'

/* ------------------------------------------------------------------------
 * Spec 构建（数据全部来自现有 target 字段；仅专辑 Brief 缺曲目数时需先拉详情）
 * --------------------------------------------------------------------- */

export function buildShareCardSpec(source: ShareCardSource, accentHex: string): ShareCardSpec | null {
  if (source.kind === 'collage') return buildCollageSpec(source.albums, accentHex)
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

export const COLLAGE_MIN = 2
export const COLLAGE_MAX = 9

/** 拼贴卡 spec（S2）：标题/元信息固定文案，封面列表随选中顺序 */
export function buildCollageSpec(albums: AlbumBrief[], accentHex: string): ShareCardSpec {
  return {
    kind: 'collage',
    title: '我的唱片架',
    subtitle: '',
    meta: `${albums.length} 张专辑`,
    coverUrl: albums[0]?.coverUrl ?? '',
    collageCovers: albums.map((a) => a.coverUrl),
    accentHex,
  }
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
const COVER_GAP = 56 // 竖版封面-文字间距
const H_TEXT_GAP = 72 // 横版封面-文案列间距
const BOTTOM_PAD = 44 // 底部评论块距底边（原落款行位置）

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

/** 文本栈总高（徽标 + 标题 + 副题 + 元信息；评论不在栈内，固定在卡片底部） */
function stackHeight(f: Fonts, titleLines: number): number {
  return 44 + 36 + titleLines * f.titleLh + 22 + f.subtitleLh + 18 + 36
}

/**
 * 文本栈绘制（徽标 → 标题 → 副题 → 元信息），返回实际占用高度。
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
  y += f.subtitleLh + 18

  // 元信息
  ctx.font = `${f.meta} ${FONT_STACK}`
  ctx.fillStyle = '#a3a3a3'
  ctx.fillText(ellipsize(ctx, spec.meta, maxW), x, y + 26)
  y += 36

  return y - start
}

/**
 * 个人评论（引用体：accent 竖线 + 浅色文字），固定渲染在卡片底部原落款行位置。
 * 末行贴底边距、向上生长；竖版 / 横版同位（左下）。
 */
function drawCommentBottom(
  ctx: CanvasRenderingContext2D,
  spec: ShareCardSpec,
  m: { commentLines: string[] },
  f: Fonts,
  pad: number,
  H: number,
): void {
  const lines = m.commentLines
  if (!lines.length) return
  const blockH = lines.length * f.commentLh
  const blockTop = H - BOTTOM_PAD - blockH
  roundRectPath(ctx, pad, blockTop, 5, blockH - 8, 2.5)
  ctx.fillStyle = spec.accentHex
  ctx.fill()
  ctx.font = `${f.comment} ${FONT_STACK}`
  ctx.fillStyle = '#e5e5e5'
  lines.forEach((line, i) => {
    ctx.fillText(line, pad + 20, blockTop + f.commentLh * i + pxOf(f.comment))
  })
}

/**
 * 海报底：渐变 = 对角线性渐变 + accent 光晕三层；纯色 = 近黑实底。
 * 注意：封面径向的中心会被大封面遮挡，可见性靠「底部上升」与「外围衰减」两层保证。
 */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cx: number,
  cy: number,
  rgb: [number, number, number],
  bgStyle: 'gradient' | 'solid' = 'gradient',
) {
  if (bgStyle === 'solid') {
    ctx.fillStyle = '#101010'
    ctx.fillRect(0, 0, W, H)
    return
  }
  const lin = ctx.createLinearGradient(0, 0, W, H)
  lin.addColorStop(0, '#181818')
  lin.addColorStop(1, '#0a0a0a')
  ctx.fillStyle = lin
  ctx.fillRect(0, 0, W, H)
  const [ar, ag, ab] = rgb
  // 自底部上升（大片留白区，光晕最显眼处）
  const up = ctx.createLinearGradient(0, H, 0, H * 0.42)
  up.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.16)`)
  up.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = up
  ctx.fillRect(0, 0, W, H)
  // 封面外围径向（中心被遮挡，中段保持可见光晕）
  const r1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.45)
  r1.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.18)`)
  r1.addColorStop(0.55, `rgba(${ar}, ${ag}, ${ab}, 0.08)`)
  r1.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = r1
  ctx.fillRect(0, 0, W, H)
  const r2 = ctx.createRadialGradient(W, H, 0, W, H, W * 0.35)
  r2.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.08)`)
  r2.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = r2
  ctx.fillRect(0, 0, W, H)
}

/**
 * 封面：柔和投影（圆角矩形预投）→ 中心裁方贴图 → 1px 微描边；无图出占位。
 * opts.frame=false 时无投影/描边（拼贴无缝平铺用，投影会压到相邻封面）；
 * opts.round 控制圆角半径（拼贴传 0 = 直角）。
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  cover: HTMLImageElement | null,
  rgb: [number, number, number],
  opts: { round?: number; frame?: boolean } = {},
) {
  const R = opts.round ?? 28
  const frame = opts.frame ?? true
  if (frame) {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = size * 0.06
    ctx.shadowOffsetY = size * 0.02
    ctx.fillStyle = '#0f0f0f'
    roundRectPath(ctx, x, y, size, size, R)
    ctx.fill()
    ctx.restore()
  }

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

  if (frame) {
    roundRectPath(ctx, x, y, size, size, R)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

/**
 * 把卡片渲染到 canvas。
 * scale：1 = 导出原始尺寸；预览传（显示宽 × dpr）/ 版式宽。
 * 竖版（h ≥ w）：单栏，封面在上、文案在下，内容块垂直居中；
 * 横版（w > h）：双栏，封面左、文案右垂直居中，共用同一文本栈。
 * 个人评论（可选）固定渲染在底部原落款行位置（两种版式同位）。
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
  const pad = horizontal ? H_PAGE_PAD : PAGE_PAD

  let coverX: number
  let coverY: number
  let coverSize: number
  let textX: number
  let textTop: number
  let maxTextW: number

  if (horizontal) {
    // 双栏：先量文本栈定文案列宽度，再定封面尺寸（扣除页边与底部评论区）
    textX = H_PAGE_PAD + Math.round(W * 0.4) + H_TEXT_GAP
    maxTextW = W - textX - H_PAGE_PAD
    const m = measureStack(ctx, spec, maxTextW, f)
    const zone = m.commentLines.length ? m.commentLines.length * f.commentLh + 24 : 0
    const availSpan = H - 2 * H_PAGE_PAD - zone
    coverSize = Math.min(availSpan, Math.round(W * 0.4))
    coverX = H_PAGE_PAD
    coverY = H_PAGE_PAD + Math.round((availSpan - coverSize) / 2)
    textX = H_PAGE_PAD + coverSize + H_TEXT_GAP
    const sh = stackHeight(f, m.titleLines.length)
    textTop = coverY + Math.max(0, Math.round((coverSize - sh) / 2))
    drawBackground(ctx, W, H, coverX + coverSize / 2, coverY + coverSize / 2, rgb, spec.bgStyle)
    drawCover(ctx, coverX, coverY, coverSize, cover, rgb)
    drawStack(ctx, spec, textX, textTop, maxTextW, f, m)
    drawCommentBottom(ctx, spec, m, f, pad, H)
  } else {
    // 单栏：封面先按上限，再按「最坏 2 行标题 + 页边 + 底部评论区」逐档收缩
    maxTextW = W - 2 * PAGE_PAD
    const m = measureStack(ctx, spec, maxTextW, f)
    const zone = m.commentLines.length ? m.commentLines.length * f.commentLh + 24 : 0
    const maxContentH = H - 2 * PAGE_PAD - zone
    coverSize = Math.min(W - 2 * PAGE_PAD, Math.round(H * 0.55))
    while (
      coverSize + COVER_GAP + stackHeight(f, f.titleMax) > maxContentH &&
      coverSize > W * 0.38
    ) {
      coverSize -= 8
    }
    const blockH = coverSize + COVER_GAP + stackHeight(f, m.titleLines.length)
    coverX = Math.round((W - coverSize) / 2)
    coverY = PAGE_PAD + Math.max(0, Math.round((maxContentH - blockH) / 2))
    textX = PAGE_PAD
    textTop = coverY + coverSize + COVER_GAP
    drawBackground(ctx, W, H, W / 2, coverY + coverSize * 0.35, rgb, spec.bgStyle)
    drawCover(ctx, coverX, coverY, coverSize, cover, rgb)
    drawStack(ctx, spec, textX, textTop, maxTextW, f, m)
    drawCommentBottom(ctx, spec, m, f, pad, H)
  }
}

/**
 * 拼贴卡（S2）：满版封面网格（无徽标/标题/元信息），
 * 评论引用体置底（同 S1），背景/色板/导出全部复用单卡链路。
 * covers：与 spec.collageCovers 对齐的像素图（失败项为 null → 占位）。
 */
export function renderCollageCard(
  canvas: HTMLCanvasElement,
  spec: ShareCardSpec,
  ratio: ShareCardRatio,
  covers: (HTMLImageElement | null)[],
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
  const pad = horizontal ? H_PAGE_PAD : PAGE_PAD

  drawBackground(ctx, W, H, W / 2, H * 0.3, rgb, spec.bgStyle)

  // 拼贴卡无文字元素（徽标/标题/元信息均无，spec.title 仅用于导出文件名），直接满版封面网格
  const maxTextW = W - 2 * pad

  // 底部评论区预留（同单卡）；剩余空间给封面网格
  const m = measureStack(ctx, spec, maxTextW, f)
  const commentZone = m.commentLines.length ? m.commentLines.length * f.commentLh + 24 : 0
  const gridTop = pad
  const gridBottom = H - BOTTOM_PAD - commentZone - (m.commentLines.length ? 0 : 24)

  // 行列：横版 2→1×2、3–4→2×2、5–9→3×N；竖版 2→2×1（竖叠）、3–6→2×N、7–9→3×3
  const n = spec.collageCovers?.length ?? 0
  const cols = horizontal ? (n <= 4 ? 2 : 3) : n <= 2 ? 1 : n <= 6 ? 2 : 3
  const rows = Math.ceil(Math.max(n, 1) / cols)
  // 无缝平铺：无间隙、直角、无投影描边
  const gap = 0
  const availW = W - 2 * pad
  const availH = Math.max(gridBottom - gridTop, 100)
  const cell = Math.min((availW - (cols - 1) * gap) / cols, (availH - (rows - 1) * gap) / rows)
  const gridW = cols * cell + (cols - 1) * gap
  const gridH = rows * cell + (rows - 1) * gap
  const gridX = pad + (availW - gridW) / 2
  const gridY = gridTop + Math.max(0, (availH - gridH) / 2)
  spec.collageCovers?.forEach((_, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    drawCover(ctx, gridX + c * cell, gridY + r * cell, cell, covers[i] ?? null, rgb, {
      round: 0,
      frame: false,
    })
  })

  drawCommentBottom(ctx, spec, m, f, pad, H)
}

/* ------------------------------------------------------------------------
 * 导出
 * --------------------------------------------------------------------- */

/**
 * 离屏渲染 → JPEG Blob（scale=1 基准尺寸，画质 0.92）。
 * 统一导出 JPG（需求方定）；kind='collage' 走拼贴渲染（covers 对齐 spec.collageCovers）。
 */
export async function exportShareCardBlob(
  spec: ShareCardSpec,
  ratio: ShareCardRatio,
  cover: HTMLImageElement | null,
  covers?: (HTMLImageElement | null)[],
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  if (spec.kind === 'collage') renderCollageCard(canvas, spec, ratio, covers ?? [], 1)
  else renderShareCard(canvas, spec, ratio, cover, 1)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92))
}
