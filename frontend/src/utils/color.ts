/** 颜色工具：主题色（强调色）派生。CSS 变量以「RGB 三元组」存储，配合 Tailwind <alpha-value> 使用。 */

export type Rgb = [number, number, number]

export interface AccentPalette {
  /** 基础强调色（原 emerald-500 角色：填充、边框、accent-color） */
  accent: string
  /** 强调文字/图标（原 emerald-400 角色） */
  text: string
  /** 浅强调（原 emerald-300 角色：激活态文字、hover） */
  soft: string
  /** hover / active 填充变体（原 hover:bg-accent-hover 角色） */
  hover: string
}

export interface AccentPreset {
  name: string
  label: string
  hex: string
  text: string
  soft: string
}

/** 预设色板（hex 取自 Tailwind 500 / 400 / 300 档） */
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'emerald', label: '翡翠', hex: '#10b981', text: '#34d399', soft: '#6ee7b7' },
  { name: 'cyan', label: '青', hex: '#06b6d4', text: '#22d3ee', soft: '#67e8f9' },
  { name: 'blue', label: '蓝', hex: '#3b82f6', text: '#60a5fa', soft: '#93c5fd' },
  { name: 'violet', label: '紫', hex: '#8b5cf6', text: '#a78bfa', soft: '#c4b5fd' },
  { name: 'rose', label: '玫红', hex: '#f43f5e', text: '#fb7185', soft: '#fda4af' },
  { name: 'amber', label: '琥珀', hex: '#f59e0b', text: '#fbbf24', soft: '#fcd34d' },
  { name: 'orange', label: '橙', hex: '#f97316', text: '#fb923c', soft: '#fdba74' },
]

export const HEX6_PATTERN = /^#?[0-9a-fA-F]{6}$/

export function normalizeHex(input: string): string | null {
  const t = input.trim()
  if (!HEX6_PATTERN.test(t)) return null
  return (t.startsWith('#') ? t : `#${t}`).toLowerCase()
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const n = parseInt(normalized.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToTriplet([r, g, b]: Rgb): string {
  return `${r} ${g} ${b}`
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function mixWhite(rgb: Rgb, ratio: number): Rgb {
  return [rgb[0], rgb[1], rgb[2]].map((c) => Math.round(c + (255 - c) * ratio)) as Rgb
}

/** 相对亮度（0..1，WCAG 近似） */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => c / 255) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 预设 → 调色板（hover 复用 400 档 = text） */
export function presetPalette(preset: AccentPreset): AccentPalette {
  const accent = hexToRgb(preset.hex)
  const text = hexToRgb(preset.text)
  const soft = hexToRgb(preset.soft)
  if (!accent || !text || !soft) {
    return { accent: '16 185 129', text: '52 211 153', soft: '110 231 183', hover: '52 211 153' }
  }
  return {
    accent: rgbToTriplet(accent),
    text: rgbToTriplet(text),
    soft: rgbToTriplet(soft),
    hover: rgbToTriplet(text),
  }
}

/**
 * 自定义色 → 调色板。
 * 保证播放主按钮等「深色文字压在强调色上」场景的对比度：限制基础色最小亮度。
 */
export function buildAccentPalette(hex: string): AccentPalette | null {
  let base = hexToRgb(hex)
  if (!base) return null
  // 与近黑文字（neutral-950）保持可读：逐步向白混合直到亮度达标
  for (let i = 0; i < 12 && luminance(base) < 0.22; i++) {
    base = mixWhite(base, 0.12)
  }
  return {
    accent: rgbToTriplet(base),
    text: rgbToTriplet(mixWhite(base, 0.18)),
    soft: rgbToTriplet(mixWhite(base, 0.38)),
    hover: rgbToTriplet(mixWhite(base, 0.18)),
  }
}
