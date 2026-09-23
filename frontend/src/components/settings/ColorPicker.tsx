import { useState } from 'react'
import { ACCENT_PRESETS, normalizeHex } from '../../utils/color'
import type { AccentPresetName, AppearancePrefs } from '../../stores/settingsStore'

interface Props {
  appearance: AppearancePrefs
  onChange: (patch: Partial<AppearancePrefs>) => void
}

/** 主题色（强调色）选择：预设色板 + 自定义颜色（HEX6 / 取色器） */
export function ColorPicker({ appearance, onChange }: Props) {
  const [hexInput, setHexInput] = useState(appearance.customColor)
  const [error, setError] = useState('')

  const applyHex = (raw: string) => {
    setHexInput(raw)
    const hex = normalizeHex(raw)
    if (!hex) {
      setError('请输入 6 位 HEX 颜色，如 #10b981')
      return
    }
    setError('')
    onChange({ accentPreset: 'custom', customColor: hex })
  }

  const isCustom = appearance.accentPreset === 'custom'

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((p) => {
          const active = appearance.accentPreset === p.name
          return (
            <button
              key={p.name}
              type="button"
              title={p.label}
              aria-label={`主题色 ${p.label}`}
              aria-pressed={active}
              onClick={() => onChange({ accentPreset: p.name as AccentPresetName })}
              className={`h-7 w-7 rounded-full border-2 transition ${
                active ? 'border-neutral-100' : 'border-transparent hover:border-neutral-600'
              }`}
              style={{ backgroundColor: p.hex }}
            />
          )
        })}
        <button
          type="button"
          title="自定义颜色"
          aria-label="自定义颜色"
          aria-pressed={isCustom}
          onClick={() => onChange({ accentPreset: 'custom', customColor: normalizeHex(hexInput) ?? appearance.customColor })}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs text-neutral-300 ${
            isCustom ? 'border-neutral-100 bg-neutral-800' : 'border-dashed border-neutral-600 hover:border-neutral-400'
          }`}
        >
          ＋
        </button>
      </div>

      {isCustom && (
        <div className="mt-3 flex items-center gap-3">
          <input
            type="color"
            aria-label="取色器"
            value={appearance.customColor}
            onChange={(e) => {
              const hex = normalizeHex(e.target.value)
              if (hex) {
                setHexInput(hex)
                setError('')
                onChange({ customColor: hex })
              }
            }}
            className="h-8 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-900 p-0.5"
          />
          <input
            type="text"
            value={hexInput}
            onChange={(e) => applyHex(e.target.value)}
            placeholder="#10b981"
            spellCheck={false}
            className={`w-28 rounded-lg border bg-neutral-900 px-2 py-1 text-sm text-neutral-200 outline-none ${
              error ? 'border-red-500/60' : 'border-neutral-700 focus:border-accent/60'
            }`}
          />
          <span
            className="h-6 w-6 rounded-full border border-neutral-700"
            style={{ backgroundColor: appearance.customColor }}
          />
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      )}
    </div>
  )
}
