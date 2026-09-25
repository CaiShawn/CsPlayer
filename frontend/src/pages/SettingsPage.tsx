import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import {
  BACKGROUND_KEY,
  CONTEXT_MENU_KEY,
  LYRIC_COLLAPSED_KEY,
  PREFS_BACKUP_KEY,
  PREFS_KEY,
  QUEUE_PIN_KEY,
  QUEUE_SESSION_KEY,
  VOLUME_KEY,
  useSettingsStore,
} from '../stores/settingsStore'
import { ColorPicker } from '../components/settings/ColorPicker'
import {
  AccountsSettings,
  StorageHelp,
  SubTitle,
} from '../components/settings/AccountsSettings'
import { BackgroundSettings } from '../components/settings/BackgroundSettings'
import { ContextMenuSettings } from '../components/settings/ContextMenuSettings'
import { InfoButton } from '../components/settings/InfoModal'
import { Segmented, SettingRow, SettingSection, Switch } from '../components/settings/controls'
import { APP_VERSION } from '../version'

const GROUPS = [
  { id: 'appearance', label: '外观' },
  { id: 'background', label: '背景' },
  { id: 'playback', label: '播放' },
  { id: 'lyric', label: '歌词' },
  { id: 'contextMenu', label: '右键菜单' },
  { id: 'storage', label: '存储' },
  { id: 'about', label: '关于' },
]

/* 本地数据分类明细（方案 B：总量 + 构成摘要）。key 尽量取自 settingsStore 导出常量；
   未导出的（最近播放 / 最近搜索 / 搜索页 tab）以字面量登记，改动 key 时需同步。 */
const STORAGE_GROUPS: { id: string; label: string; keys: string[] }[] = [
  { id: 'prefs', label: '偏好设置', keys: [PREFS_KEY, CONTEXT_MENU_KEY] },
  { id: 'bg', label: '背景图', keys: [BACKGROUND_KEY] },
  {
    id: 'recent',
    label: '最近记录',
    keys: [
      'csplayer:prefs:recentPlays',
      'csplayer:prefs:recentAlbums',
      'csplayer:prefs:recentPlaylists',
      'csplayer:prefs:recentSearch',
      'csplayer:searchTab',
    ],
  },
  { id: 'queue', label: '队列快照', keys: [QUEUE_SESSION_KEY] },
  {
    id: 'state',
    label: '音量与状态',
    keys: [VOLUME_KEY, LYRIC_COLLAPSED_KEY, QUEUE_PIN_KEY],
  },
  { id: 'backup', label: '偏好备份', keys: [PREFS_BACKUP_KEY] },
]

/** 构成摘要的分组换行：内容类在上行，会话 / 状态类在下行 */
const SUMMARY_CONTENT_IDS = new Set(['prefs', 'bg', 'recent'])

/** 单个 key 的存储占用（key + value，UTF-16 × 2 字节）；两个 storage 都查 */
function keyBytes(key: string): number {
  let bytes = 0
  for (const storage of [localStorage, sessionStorage]) {
    const v = storage.getItem(key)
    if (v != null) bytes += (key.length + v.length) * 2
  }
  return bytes
}

/** 各分类占用（含未登记的 csplayer:* 残留，并入「其他」，保证与总量对得上） */
function estimateStorage(): {
  total: number
  entries: { id: string; label: string; bytes: number }[]
} {
  const entries = STORAGE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    bytes: g.keys.reduce((sum, k) => sum + keyBytes(k), 0),
  }))
  const known = new Set(STORAGE_GROUPS.flatMap((g) => g.keys))
  let other = 0
  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (!k || !k.startsWith('csplayer:') || known.has(k)) continue
      other += (k.length + (storage.getItem(k) || '').length) * 2
    }
  }
  if (other > 0) entries.push({ id: 'other', label: '其他', bytes: other })
  return { total: entries.reduce((s, e) => s + e.bytes, 0), entries }
}

/** 精确占用文案：B / KB / MB（去掉「约」，给确定值） */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function SettingsPage() {
  const prefs = useSettingsStore((s) => s.prefs)
  const updateAppearance = useSettingsStore((s) => s.updateAppearance)
  const updatePlayback = useSettingsStore((s) => s.updatePlayback)
  const updateLyric = useSettingsStore((s) => s.updateLyric)
  const resetPrefs = useSettingsStore((s) => s.resetPrefs)
  const clearLocalData = useSettingsStore((s) => s.clearLocalData)
  const queueLength = usePlayerStore((s) => s.queue.length)
  const [usage, setUsage] = useState(() => estimateStorage())
  const [activeId, setActiveId] = useState(GROUPS[0].id)
  const rootRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()

  // 「自定义此菜单…」等入口可带 ?group=contextMenu 直达对应分组
  useEffect(() => {
    const group = searchParams.get('group')
    if (!group || !GROUPS.some((g) => g.id === group)) return
    const t = window.setTimeout(() => {
      setActiveId(group)
      document.getElementById(group)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [searchParams])

  // 滚动联动：高亮当前分组（主滚动容器为 <main>）
  useEffect(() => {
    const scroller = rootRef.current?.closest('main') ?? document.documentElement
    const onScroll = () => {
      let current = GROUPS[0].id
      for (const g of GROUPS) {
        const el = document.getElementById(g.id)
        if (el && el.getBoundingClientRect().top <= 120) current = g.id
      }
      setActiveId(current)
    }
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  const refreshUsage = () => setUsage(estimateStorage())
  const usedEntries = usage.entries.filter((e) => e.bytes > 0)
  const formatEntry = (e: (typeof usedEntries)[number]) =>
    `${e.label} ${formatBytes(e.bytes)}${e.id === 'queue' ? `（${queueLength} 首）` : ''}`
  // 摘要固定两行：偏好/背景/最近记录一行，队列/音量状态/备份一行
  const summaryLines = [
    usedEntries.filter((e) => SUMMARY_CONTENT_IDS.has(e.id)).map(formatEntry),
    usedEntries.filter((e) => !SUMMARY_CONTENT_IDS.has(e.id)).map(formatEntry),
  ]
    .map((line) => line.join(' · '))
    .filter(Boolean)

  const onClearLocalData = () => {
    const items = usedEntries.map((e) => e.label).join('、') || '全部本地数据'
    if (
      !window.confirm(
        `将清除：${items}（不含登录凭证）；当前播放队列同时清空，继续？`,
      )
    )
      return
    clearLocalData()
    usePlayerStore.getState().clearQueue()
    refreshUsage()
  }

  const scrollTo = (id: string) => {
    setActiveId(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={rootRef} className="flex gap-8 p-8 pb-10">
      {/* 左侧分组锚点：窄栏 + accent 指示条，与主侧边栏（块状高亮）区分；
          sticky top-8 = 始终与顶部保持固定边距（与页面 p-8 一致），不贴顶 */}
      <nav className="sticky top-8 hidden h-fit w-24 shrink-0 self-start lg:block">
        <div className="space-y-0.5 border-l border-neutral-800">
          {GROUPS.map((g) => {
            const active = g.id === activeId
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => scrollTo(g.id)}
                className={`relative block w-full py-1.5 pl-4 pr-2 text-left text-xs transition-colors ${
                  active ? 'text-accent-soft' : 'text-neutral-500 hover:text-neutral-200'
                }`}
              >
                {active && (
                  <span className="absolute -left-px top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                )}
                {g.label}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="min-w-0 max-w-2xl flex-1 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-neutral-50">设置</h1>
          <p className="mt-1 text-sm text-neutral-500">偏好保存在本机浏览器（localStorage），不随账号同步</p>
        </div>

        {/* 外观 */}
        <SettingSection id="appearance" title="外观" desc="主题色与封面圆角，修改立即生效">
          <SettingRow label="主题色（强调色）" hint="预设色板或自定义 HEX 颜色，应用到按钮、导航、进度条等强调色">
            <ColorPicker appearance={prefs.appearance} onChange={updateAppearance} />
          </SettingRow>
          <SettingRow label="封面圆角" hint="卡片与封面圆角档位">
            <Segmented
              label="封面圆角"
              value={prefs.appearance.coverRadius}
              onChange={(coverRadius) => updateAppearance({ coverRadius })}
              options={[
                { value: 'none', label: '无' },
                { value: 'md', label: '中' },
                { value: 'lg', label: '大' },
              ]}
            />
          </SettingRow>
        </SettingSection>

        {/* 背景（v0.1.6）：排「外观」之后（设计 §4.5） */}
        <BackgroundSettings />

        {/* 播放 */}
        <SettingSection id="playback" title="播放" desc="音量记忆、不可播放行为与队列恢复">
          <SettingRow label="记住音量" hint="启动时恢复上次音量">
            <Switch
              label="记住音量"
              checked={prefs.playback.rememberVolume}
              onChange={(rememberVolume) => updatePlayback({ rememberVolume })}
            />
          </SettingRow>
          <SettingRow
            label="不可播放时"
            hint="无版权等不可播曲目：自动跳过下一首，或停止并提示（单曲循环下避免忙循环）"
          >
            <Segmented
              label="不可播放时"
              value={prefs.playback.unplayableAction}
              onChange={(unplayableAction) => updatePlayback({ unplayableAction })}
              options={[
                { value: 'skip', label: '自动跳过' },
                { value: 'stop', label: '停止并提示' },
              ]}
            />
          </SettingRow>
          <SettingRow
            label="刷新后恢复队列"
            hint="刷新页面后恢复播放队列与原播放进度（是否自动继续播放由下一项控制）"
          >
            <Switch
              label="刷新后恢复队列"
              checked={prefs.playback.restoreQueue}
              onChange={(restoreQueue) => updatePlayback({ restoreQueue })}
            />
          </SettingRow>
          <SettingRow
            label="刷新后自动播放"
            hint="刷新恢复后从原进度自动继续播放；关闭则停在原进度待手动播放（需开启「刷新后恢复队列」）"
          >
            <InfoButton
              title="自动播放被浏览器拦截？"
              label="自动播放设置遇到问题？查看浏览器侧解决方案"
            >
              <AutoplayHelp />
            </InfoButton>
            <Switch
              label="刷新后自动播放"
              checked={prefs.playback.autoPlayOnRestore}
              onChange={(autoPlayOnRestore) => updatePlayback({ autoPlayOnRestore })}
            />
          </SettingRow>
          <SettingRow label="自动续播下一首" hint="当前曲目播完后自动继续；关闭则播完停住">
            <Switch
              label="自动续播下一首"
              checked={prefs.playback.autoNext}
              onChange={(autoNext) => updatePlayback({ autoNext })}
            />
          </SettingRow>
        </SettingSection>

        {/* 歌词 */}
        <SettingSection id="lyric" title="歌词" desc="歌词面板的字号、翻译与高亮">
          <SettingRow label="歌词字号">
            <Segmented
              label="歌词字号"
              value={prefs.lyric.fontSize}
              onChange={(fontSize) => updateLyric({ fontSize })}
              options={[
                { value: 'sm', label: '小' },
                { value: 'md', label: '中' },
                { value: 'lg', label: '大' },
              ]}
            />
          </SettingRow>
          <SettingRow label="显示翻译" hint="有翻译时双行展示">
            <Switch
              label="显示翻译"
              checked={prefs.lyric.showTranslation}
              onChange={(showTranslation) => updateLyric({ showTranslation })}
            />
          </SettingRow>
          <SettingRow label="高亮当前行" hint="关闭则全词同色，仅滚动跟随">
            <Switch
              label="高亮当前行"
              checked={prefs.lyric.highlightCurrent}
              onChange={(highlightCurrent) => updateLyric({ highlightCurrent })}
            />
          </SettingRow>
        </SettingSection>

        {/* 右键菜单 */}
        <ContextMenuSettings />

        {/* 存储（v0.1.6 合并：账号凭证 + 本地数据，框中框结构同右键菜单） */}
        <SettingSection
          id="storage"
          title="存储"
          desc="登录凭证与本地数据，均保存在本机浏览器"
          extra={
            <InfoButton title="存储与清除说明" label="查看存储与清除说明">
              <StorageHelp />
            </InfoButton>
          }
        >
          <AccountsSettings />

          {/* 本地数据：右键菜单同款多行设置卡（文本块 + 按钮右对齐） */}
          <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4">
            {/* 头部：标题（左） / 清除本地数据（右上） */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SubTitle>本地数据</SubTitle>
              <button
                type="button"
                onClick={onClearLocalData}
                className="rounded-full border border-red-500/40 bg-neutral-900 px-4 py-1.5 text-xs text-red-400 hover:border-red-400 hover:bg-red-500/10"
              >
                清除本地数据
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-neutral-100">本地数据占用 · {formatBytes(usage.total)}</div>
                  <div className="mt-0.5 text-xs leading-5 text-neutral-500">
                    {summaryLines.length ? (
                      summaryLines.map((line) => <div key={line}>{line}</div>)
                    ) : (
                      <span>暂无本地数据</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshUsage}
                  className="ml-auto shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-accent/50 hover:text-accent-soft"
                >
                  重新统计
                </button>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-neutral-100">恢复默认</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    重置全部偏好设置为默认值，并清除背景图；最近记录、播放队列与登录凭证不动
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        '将重置全部偏好设置为默认值并清除背景图；最近记录、播放队列与登录凭证不受影响。继续？',
                      )
                    ) {
                      resetPrefs()
                      refreshUsage()
                    }
                  }}
                  className="ml-auto shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-accent/50 hover:text-accent-soft"
                >
                  恢复默认
                </button>
              </div>
            </div>
          </div>
        </SettingSection>

        {/* 关于 */}
        <SettingSection id="about" title="关于" desc="版本与声明">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 text-xs leading-5 text-neutral-500">
            <div className="text-sm text-neutral-200">CsPlayer v{APP_VERSION}</div>
            <div className="mt-1">第三方网易云 Web 播放器（Third-party web player for NCM），非网易官方产品。</div>

            <div className="mt-1">
              觉得好用的话，点个 Star 就是最大的鼓励；碰到 Bug 或者想要什么功能，
              直接提 Issue 就好；想动手一起改，PR 随时欢迎。开源地址：
              <a
                href="https://github.com/CaiShawn/CsPlayer"
                target="_blank"
                rel="noreferrer"
                className="text-accent-soft hover:underline"
              >
                github.com/CaiShawn/CsPlayer
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 text-xs leading-5">
            <div className="font-semibold text-neutral-200">本项目仅供学习使用，请尊重版权，支持正版音乐。</div>
          </div>
        </SettingSection>
      </div>
    </div>
  )
}

/** 「刷新后自动播放」 ⓘ 弹窗内容：浏览器侧放行自动播放的解决方案 */
function AutoplayHelp() {
  return (
    <>
      <div>
        开启后若刷新仍未自动播放（提示「浏览器阻止了自动播放」），是浏览器自动播放策略拦截——刷新后页面没有用户手势，
        浏览器禁止出声播放。在浏览器里为本站放行即可：
      </div>
      <div>
        <div className="text-neutral-200">Chrome（注意：没有「自动播放」站点设置）</div>
        桌面版 Chrome 已移除该设置页（旧地址{' '}
        <span className="text-neutral-300">chrome://settings/content/mediaAutoplay</span> 会跳回设置首页），可选做法：
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            媒体参与度自动放行（推荐）：在本站正常听歌一段时间后 Chrome 会自动放行；可打开{' '}
            <span className="text-neutral-300">chrome://media-engagement</span> 查看本站分数，
            「Autoplay allowed」显示「是」即已生效。
          </li>
          <li>
            开发机全局放开：<span className="text-neutral-300">chrome://flags/#autoplay-policy</span> →
            「No user gesture is required」后重启；或给 Chrome 快捷方式加启动参数{' '}
            <span className="text-neutral-300">--autoplay-policy=no-user-gesture-required</span>。
          </li>
          <li>
            确认声音权限没被拉黑：<span className="text-neutral-300">chrome://settings/content/sound</span> →
            本站选「允许」（被「静音」的站点会直接无声）。
          </li>
        </ul>
      </div>
      <div>
        <div className="text-neutral-200">Edge</div>
        地址栏左侧图标（🔒/调节）→「网站设置」→「媒体自动播放」→ 允许；或打开{' '}
        <span className="text-neutral-300">edge://settings/content/mediaAutoplay</span> 把本站加入允许名单（Edge 保留了该设置页）。
      </div>
      <div>
        <div className="text-neutral-200">Firefox</div>
        地址栏 🔒 图标 → 关闭「阻止音频自动播放」；或{' '}
        <span className="text-neutral-300">about:preferences#privacy</span> → 权限 → 自动播放 → 音频选「允许」。
      </div>
      <div>
        <div className="text-neutral-200">Safari</div>
        Safari → 设置 → 网站 → 自动播放 → 对本站选「允许所有自动播放」。
      </div>
      <div>
        <div className="text-neutral-200">其他</div>
        首次点一下播放按钮后，本页后续的手动播放/切歌都会正常；被拦截时应用会提示「浏览器阻止了自动播放」。
      </div>
      <div>
        <div className="text-neutral-200">如果其实播了但没声音</div>
        检查播放器音量是否为 0 / 静音（🔇）、系统音量合成器里浏览器是否被静音、标签页是否被右键静音。
      </div>
    </>
  )
}
