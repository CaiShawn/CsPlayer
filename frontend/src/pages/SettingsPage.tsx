import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ColorPicker } from '../components/settings/ColorPicker'
import { AccountsSettings } from '../components/settings/AccountsSettings'
import { ContextMenuSettings } from '../components/settings/ContextMenuSettings'
import { Segmented, SettingRow, SettingSection, Switch } from '../components/settings/controls'
import { APP_VERSION } from '../version'

const GROUPS = [
  { id: 'appearance', label: '外观' },
  { id: 'playback', label: '播放' },
  { id: 'lyric', label: '歌词' },
  { id: 'contextMenu', label: '右键菜单' },
  { id: 'accounts', label: '账号凭证' },
  { id: 'cache', label: '缓存' },
  { id: 'about', label: '关于' },
]

function estimateStorageBytes(): number {
  let bytes = 0
  for (const storage of [localStorage, sessionStorage]) {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (!k || !k.startsWith('csplayer:')) continue
      bytes += (k.length + (storage.getItem(k) || '').length) * 2 // UTF-16
    }
  }
  return bytes
}

export function SettingsPage() {
  const prefs = useSettingsStore((s) => s.prefs)
  const updateAppearance = useSettingsStore((s) => s.updateAppearance)
  const updatePlayback = useSettingsStore((s) => s.updatePlayback)
  const updateLyric = useSettingsStore((s) => s.updateLyric)
  const resetPrefs = useSettingsStore((s) => s.resetPrefs)
  const clearLocalData = useSettingsStore((s) => s.clearLocalData)
  const queueLength = usePlayerStore((s) => s.queue.length)
  const [usage, setUsage] = useState(() => estimateStorageBytes())
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

  const refreshUsage = () => setUsage(estimateStorageBytes())
  const usageKb = (usage / 1024).toFixed(1)

  const onClearLocalData = () => {
    if (!window.confirm('将清除偏好设置、播放队列快照等全部本地数据，且不可恢复。继续？')) return
    clearLocalData()
    usePlayerStore.getState().clearQueue()
    refreshUsage()
  }

  const scrollTo = (id: string) => {
    setActiveId(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={rootRef} className="flex gap-8 p-8 pb-28">
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
        <SettingSection id="appearance" title="外观" desc="主题色、界面密度与封面圆角，修改立即生效">
          <SettingRow label="主题色（强调色）" hint="预设色板或自定义 HEX 颜色，应用到按钮、导航、进度条等强调色">
            <ColorPicker appearance={prefs.appearance} onChange={updateAppearance} />
          </SettingRow>
          <SettingRow label="界面密度" hint="影响列表行高与卡片间距">
            <Segmented
              label="界面密度"
              value={prefs.appearance.density}
              onChange={(density) => updateAppearance({ density })}
              options={[
                { value: 'comfortable', label: '舒适' },
                { value: 'compact', label: '紧凑' },
              ]}
            />
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
          <SettingRow label="刷新后恢复队列" hint="刷新页面后恢复播放队列与进度位置（不会自动播放）">
            <Switch
              label="刷新后恢复队列"
              checked={prefs.playback.restoreQueue}
              onChange={(restoreQueue) => updatePlayback({ restoreQueue })}
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

        {/* 账号凭证（v0.1.5） */}
        <AccountsSettings />

        {/* 缓存 */}
        <SettingSection id="cache" title="缓存" desc="本地数据占用与重置">
          <SettingRow
            label="本地数据占用"
            hint={`偏好与队列快照约 ${usageKb} KB（队列 ${queueLength} 首）；图片缓存由浏览器管理，无法精确统计`}
          >
            <button
              type="button"
              onClick={refreshUsage}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-accent/50 hover:text-accent-soft"
            >
              重新统计
            </button>
          </SettingRow>
          <SettingRow label="恢复默认" hint="仅重置全部偏好设置为默认值">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('将全部偏好恢复为默认值，继续？')) {
                  resetPrefs()
                  refreshUsage()
                }
              }}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-xs text-neutral-200 hover:border-accent/50 hover:text-accent-soft"
            >
              恢复默认
            </button>
          </SettingRow>
          <SettingRow
            label="清除本地数据"
            hint="偏好、队列快照等一次清空（不可恢复）；播放队列同时清空，不影响「账号凭证」中的登录凭证"
          >
            <button
              type="button"
              onClick={onClearLocalData}
              className="rounded-full border border-red-500/40 bg-neutral-900 px-4 py-1.5 text-xs text-red-400 hover:border-red-400 hover:bg-red-500/10"
            >
              清除本地数据
            </button>
          </SettingRow>
        </SettingSection>

        {/* 关于 */}
        <SettingSection id="about" title="关于" desc="版本与声明">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 text-xs leading-5 text-neutral-500">
            <div className="text-sm text-neutral-200">CsPlayer v{APP_VERSION}</div>
            <div className="mt-1">第三方网易云 Web 播放器（Third-party web player for NCM），非网易官方产品。</div>
            <div>本项目仅供学习使用，请尊重版权，支持正版音乐。</div>
            <div className="mt-2">
              文档：仓库内 <span className="text-neutral-400">docs/</span> 目录（V0.1.x_DESIGN.md、SDK参考文档.md 等，历史版本见 docs/archived/）
            </div>
          </div>
        </SettingSection>
      </div>
    </div>
  )
}
