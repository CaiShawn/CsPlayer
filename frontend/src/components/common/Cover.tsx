interface Props {
  url: string
  alt?: string
  className?: string
  rounded?: boolean
}

export function Cover({ url, alt = '', className = '', rounded = true }: Props) {
  return (
    <div
      className={`relative overflow-hidden bg-neutral-800 ${rounded ? 'rounded-[var(--radius-cover)]' : ''} ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-600">
          ♪
        </div>
      )}
    </div>
  )
}
