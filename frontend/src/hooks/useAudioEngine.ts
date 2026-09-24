import { useEffect, useRef } from 'react'
import { songApi } from '../api'
import { useAuthStore } from '../stores/authStore'
import { useLikesStore } from '../stores/likesStore'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * play() 被更新的 load() / pause() 打断（AbortError）只表示「被取代」，
 * 不代表「不想播」——绝不能据此回写 playing（会和事件回声形成播放/暂停乒乓）。
 */
function isAbortError(e: unknown): boolean {
  const name = e instanceof DOMException ? e.name : ''
  return name === 'AbortError' || name === 'InterruptedError'
}

/**
 * play() 失败处理：AbortError（被后续加载/暂停取代）静默忽略；
 * NotAllowedError = 浏览器自动播放策略拦截（刷新后无用户手势），
 * 不做静音变通，置为暂停并给出可操作提示（解除限制见 README/设置说明）。
 */
function handlePlayFailure(e: unknown, stale = false): void {
  if (isAbortError(e) || stale) return
  usePlayerStore.getState().setPlaying(false)
  if (e instanceof DOMException && e.name === 'NotAllowedError') {
    useLikesStore.getState().setToast('浏览器阻止了自动播放，点播放按钮即可从原进度继续')
  }
}

/**
 * Singleton HTMLAudioElement bound to playerStore.
 * Mount once inside MainLayout.
 *
 * 状态模型：store 的 `playing` 是「播放意图」的唯一事实源，由下方 play/pause
 * effect 强制执行；音频元素的 'play'/'pause' 事件**不回写** store——它们混杂了
 * load()/play()/pause() 竞态产生的程序性事件，回写会形成「事件 → setPlaying →
 * effect → play/pause → 事件」的回声环（表现为播放/暂停频繁切换、按钮失灵）。
 * 只有 'ended' / 'error' 这类真实终态才回写。
 */
export function useAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadToken = usePlayerStore((s) => s.loadToken)
  const playing = usePlayerStore((s) => s.playing)
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore((s) => s.muted)
  const quality = usePlayerStore((s) => s.quality)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const onTime = () => {
      usePlayerStore.getState().setCurrentTime(audio.currentTime)
      usePlayerStore.getState().syncLyricIndex(audio.currentTime)
    }
    const onMeta = () => {
      usePlayerStore.getState().setDuration(audio.duration || 0)
    }
    const onEnded = () => usePlayerStore.getState().handleEnded()
    const onError = () => {
      // 清空 src 触发的伪 error 忽略
      if (!audio.getAttribute('src')) return
      usePlayerStore.getState().setPlaying(false)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.src = ''
    }
  }, [])

  // load song when loadToken changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const state = usePlayerStore.getState()
    const song = state.currentSong()

    // 立刻停掉旧曲并卸载资源：切歌瞬间旧音频继续播（甚至被 seek 回 0:00 重播）
    // 就是「下一首的前几秒听到上一首」的来源；清空 src 也让 play/pause effect
    // 在取新 URL 的窗口期内不作为（audio.src 为空即跳过，避免误播旧曲）。
    audio.removeAttribute('src')
    audio.load()

    if (!song) return

    let cancelled = false

    const load = async () => {
      try {
        const level = usePlayerStore.getState().quality
        // 歌词不阻塞起播：只等播放地址，歌词回来后补上（缩短切歌静默间隙）
        const lyricPromise = songApi
          .lyric(song.id)
          .catch(() => ({ lrc: [], tlyric: [], hasTime: true }))
        const urlRes = await songApi.url(song.id, level)
        if (cancelled) return
        if (!urlRes.playable || !urlRes.url) {
          // 「不可播放时」偏好：自动跳过 / 停止并提示
          const st = usePlayerStore.getState()
          st.setPlaying(false)
          const action = useSettingsStore.getState().prefs.playback.unplayableAction
          if (action === 'stop') {
            useLikesStore.getState().setToast(`「${song.name}」不可播放，已停止`)
          } else {
            st.skipUnplayable()
          }
          return
        }
        usePlayerStore.getState().markPlayable()
        // 回到原播放进度（刷新恢复的进度；正常切歌时为 0 即不 seek）
        const startPos = usePlayerStore.getState().currentTime
        audio.src = urlRes.url
        audio.load()
        if (startPos > 0.5) {
          try {
            audio.currentTime = startPos
          } catch {
            // 极少数浏览器在元数据就绪前 seek 会抛错：忽略，该曲从头播
          }
        }
        if (usePlayerStore.getState().playing) {
          await audio.play().catch((e) => handlePlayFailure(e, cancelled))
        }
        const lyricRes = await lyricPromise
        if (!cancelled) usePlayerStore.getState().setLyric(lyricRes)
      } catch {
        if (!cancelled) usePlayerStore.getState().setPlaying(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadToken, quality])

  // play / pause（store.playing 是唯一事实源，这里只负责执行，不回写）
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    if (playing) {
      void audio.play().catch((e) => handlePlayFailure(e))
    } else {
      audio.pause()
    }
  }, [playing])

  // volume
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [volume, muted])

  // seek support via store currentTime when user drags (external seek)
  useEffect(() => {
    return usePlayerStore.subscribe((state, prev) => {
      const audio = audioRef.current
      if (!audio) return
      // 换曲 / 重载（loadToken 变化）时 store 进度归零是「新曲从头播」，
      // 不是用户拖动进度条——绝不能拿去 seek 旧音频（会把上一首拉回 0:00 重播）
      if (state.loadToken !== prev.loadToken) return
      // detect external seek: currentTime jumped without audio timeupdate
      if (
        Math.abs(state.currentTime - prev.currentTime) > 1.2 &&
        Math.abs(state.currentTime - audio.currentTime) > 1.2
      ) {
        audio.currentTime = state.currentTime
      }
    })
  }, [])

  return audioRef
}

/** Trigger play of a track list. */
export function playTracks(list: Parameters<ReturnType<typeof usePlayerStore.getState>['playSongs']>[0], startIndex = 0) {
  usePlayerStore.getState().playSongs(list, startIndex)
}

export function useIsLoggedIn() {
  return useAuthStore((s) => !!s.user)
}
