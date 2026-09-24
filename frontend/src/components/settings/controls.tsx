import type { ReactNode } from 'react'

/** 设置分组（带锚点 id，供左侧分组锚点跳转） */
export function SettingSection({
  id,
  title,
  desc,
  children,
}: {
  id: string
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      {desc && <p className="mt-1 text-xs text-neutral-500">{desc}</p>}
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  )
}

/** 单行设置：左侧标签 + 说明，右侧控件 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm text-neutral-100">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-4 text-neutral-500">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  )
}

/** 开关 */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-neutral-100 transition-all ${
          checked ? 'left-[1.375rem]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

/** 分段选择（单选一组） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex overflow-hidden rounded-full border border-neutral-700 text-sm"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 transition-colors ${
            value === opt.value
              ? 'bg-accent text-neutral-950'
              : 'text-neutral-300 hover:bg-neutral-900'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
