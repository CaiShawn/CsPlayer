import { Link } from 'react-router-dom'

const CARDS = [
  {
    to: '/like',
    title: '我喜欢',
    desc: '云端红心歌曲，设备同步',
    icon: '♥',
  },
  {
    to: '/record',
    title: '听歌排行榜',
    desc: '云端听歌排行',
    icon: '⏱',
  },
  {
    to: '/shelf',
    title: '唱片架',
    desc: '收藏的专辑',
    icon: '♫',
  },
]

export function HomePage() {
  return (
    <div className="p-8 pb-28">
      <h1 className="text-2xl font-bold text-neutral-50">首页</h1>
      <p className="mt-1 text-sm text-neutral-500">快速进入你的音乐板块</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 transition hover:border-accent/40 hover:bg-neutral-900"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-xl text-accent-soft">
              {c.icon}
            </div>
            <div className="mt-4 text-lg font-semibold text-neutral-100 group-hover:text-accent-soft">
              {c.title}
            </div>
            <div className="mt-1 text-sm text-neutral-500">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
