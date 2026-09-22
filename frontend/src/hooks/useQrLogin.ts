import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi } from '../api'
import type { QrStatus, UserProfile } from '../types'

const POLL_MS = 3000
const POLL_BUSY_BACKOFF_MS = 8000

/** 模块级：避免 StrictMode / 热更新时重复打 qr/key */
let inflightCreate: Promise<boolean> | null = null
let sharedUnikey = ''
let sharedQrimg = ''

export function useQrLogin(onSuccess: (user: UserProfile) => void) {
  const [qrimg, setQrimg] = useState(sharedQrimg)
  const [status, setStatus] = useState<QrStatus | 'loading'>(sharedQrimg ? 'waiting' : 'loading')
  const [error, setError] = useState('')

  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  const unikeyRef = useRef(sharedUnikey)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const stopPoll = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const schedulePoll = useCallback((delay: number) => {
    stopPoll()
    timerRef.current = window.setTimeout(async () => {
      if (!mountedRef.current) return
      const key = unikeyRef.current
      if (!key) return
      try {
        const res = await authApi.qrCheck(key)
        if (!mountedRef.current) return

        if (res.status === 'rate_limited') {
          setError('操作频繁，稍后自动重试…')
          schedulePoll(POLL_BUSY_BACKOFF_MS)
          return
        }

        setError('')
        setStatus(res.status)

        if (res.status === 'success' && res.user) {
          stopPoll()
          onSuccessRef.current(res.user)
          return
        }
        if (res.status === 'expired') {
          stopPoll()
          return
        }
        // waiting / scanned → 继续轮询
        schedulePoll(POLL_MS)
      } catch (e) {
        if (!mountedRef.current) return
        const msg = e instanceof Error ? e.message : '检查二维码失败'
        setError(msg)
        schedulePoll(msg.includes('频繁') ? POLL_BUSY_BACKOFF_MS : POLL_MS)
      }
    }, delay)
  }, [stopPoll])

  const doCreate = useCallback(async (): Promise<boolean> => {
    setError('')
    setStatus('loading')
    setQrimg('')
    stopPoll()
    try {
      const { unikey } = await authApi.qrKey()
      sharedUnikey = unikey
      unikeyRef.current = unikey
      const created = await authApi.qrCreate(unikey)
      sharedQrimg = created.qrimg
      setQrimg(created.qrimg)
      setStatus('waiting')
      schedulePoll(POLL_MS)
      return true
    } catch (e) {
      setStatus('expired')
      setError(e instanceof Error ? e.message : '获取二维码失败')
      return false
    }
  }, [schedulePoll, stopPoll])

  const create = useCallback((): Promise<boolean> => {
    if (inflightCreate) return inflightCreate
    // 已有可用二维码时（StrictMode 二次挂载）只恢复轮询
    if (unikeyRef.current && sharedQrimg) {
      unikeyRef.current = sharedUnikey
      setQrimg(sharedQrimg)
      setStatus('waiting')
      schedulePoll(POLL_MS)
      return Promise.resolve(true)
    }
    inflightCreate = doCreate().finally(() => {
      inflightCreate = null
    })
    return inflightCreate
  }, [doCreate, schedulePoll])

  const refresh = useCallback((): Promise<boolean> => {
    sharedUnikey = ''
    sharedQrimg = ''
    unikeyRef.current = ''
    setQrimg('')
    if (inflightCreate) return inflightCreate
    inflightCreate = doCreate().finally(() => {
      inflightCreate = null
    })
    return inflightCreate
  }, [doCreate])

  useEffect(() => {
    mountedRef.current = true
    void create()
    return () => {
      mountedRef.current = false
      stopPoll()
    }
  }, [create, stopPoll])

  return { qrimg, status, error, refresh }
}
