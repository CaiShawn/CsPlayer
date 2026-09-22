import { useEffect, useRef } from 'react'
import { songApi } from '../api'
import { useAuthStore } from '../stores/authStore'
import { usePlayerStore } from '../stores/playerStore'

/**
 * Singleton HTMLAudioElement bound to playerStore.
 * Mount once inside MainLayout.
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
    const onPlay = () => usePlayerStore.getState().setPlaying(true)
    const onPause = () => usePlayerStore.getState().setPlaying(false)
    const onError = () => {
      usePlayerStore.getState().setPlaying(false)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
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
    if (!song) {
      audio.removeAttribute('src')
      audio.load()
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const level = usePlayerStore.getState().quality
        const [urlRes, lyricRes] = await Promise.all([
          songApi.url(song.id, level),
          songApi.lyric(song.id).catch(() => ({ lrc: [], tlyric: [], hasTime: true })),
        ])
        if (cancelled) return
        if (!urlRes.playable || !urlRes.url) {
          usePlayerStore.getState().setPlaying(false)
          // try next track
          usePlayerStore.getState().handleEnded()
          return
        }
        usePlayerStore.getState().setLyric(lyricRes)
        audio.src = urlRes.url
        audio.load()
        if (usePlayerStore.getState().playing) {
          await audio.play().catch(() => {
            usePlayerStore.getState().setPlaying(false)
          })
        }
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

  // play / pause
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    if (playing) {
      void audio.play().catch(() => usePlayerStore.getState().setPlaying(false))
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
