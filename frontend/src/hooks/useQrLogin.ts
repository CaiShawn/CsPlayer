import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi } from '../api'
import type { QrStatus, UserProfile } from '../types'

const POLL_MS = 3000
const POLL_BUSY_BACKOFF_MS = 8000
const CREATE_BUSY_BACKOFF_MS = 4500

/** 模块级：避免 StrictMode / 热更新时重复打 qr/key */
let inflightCreate: Promise<boolean> | null = null
let sharedUnikey = ''
let sharedQrimg = ''

function isBusy(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || '')
  return msg.includes('频繁')
}

export function useQrLogin(
  onSuccess: (user: UserProfile) => void,
  options?: { fresh?: boolean },
) {
  const fresh = !!options?.fresh
  const [qrimg, setQrimg] = useState(fresh ? '' : sharedQrimg)
  const [status, setStatus] = useState<QrStatus | 'loading'>(
    !fresh && sharedQrimg ? 'waiting' : 'loading',
  )
  const [error, setError] = useState('')

  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  const unikeyRef = useRef(fresh ? '' : sharedUnikey)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const freshRef = useRef(fresh)
  const startCreateRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false))

  const stopPoll = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const schedulePoll = useCallback(
    (delay: number) => {
      stopPoll()
      timerRef.current = window.setTimeout(async () => {
        if (!mountedRef.current) return
        const key = unikeyRef.current
        if (!key) return
        try {
          const res = await authApi.qrCheck(key)
          if (!mountedRef.current) return

          if (res.status === 'rate_limited') {
            // 限流静默退避，不闪红字
            setStatus('waiting')
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
          if (isBusy(e)) {
            setStatus('waiting')
            schedulePoll(POLL_BUSY_BACKOFF_MS)
            return
          }
          setError(e instanceof Error ? e.message : '检查二维码失败')
          schedulePoll(POLL_MS)
        }
      }, delay)
    },
    [stopPoll],
  )

  const doCreate = useCallback(async (): Promise<boolean> => {
    setError('')
    setStatus('loading')
    setQrimg('')
    stopPoll()
    try {
      const { unikey } = await authApi.qrKey()
      if (!mountedRef.current) return false
      sharedUnikey = unikey
      unikeyRef.current = unikey
      const created = await authApi.qrCreate(unikey)
      if (!mountedRef.current) return false
      sharedQrimg = created.qrimg
      setQrimg(created.qrimg)
      setStatus('waiting')
      schedulePoll(POLL_MS)
      return true
    } catch (e) {
      if (!mountedRef.current) return false
      if (isBusy(e)) {
        // 限流：保持 loading 静默重试，不提示「操作频繁」
        setStatus('loading')
        setError('')
        stopPoll()
        timerRef.current = window.setTimeout(() => {
          if (mountedRef.current) void startCreateRef.current()
        }, CREATE_BUSY_BACKOFF_MS)
        return false
      }
      setStatus('expired')
      setError(e instanceof Error ? e.message : '获取二维码失败')
      return false
    }
  }, [schedulePoll, stopPoll])

  const startCreate = useCallback((): Promise<boolean> => {
    if (inflightCreate) return inflightCreate
    inflightCreate = doCreate().finally(() => {
      inflightCreate = null
    })
    return inflightCreate
  }, [doCreate])
  startCreateRef.current = startCreate

  const create = useCallback((): Promise<boolean> => {
    if (inflightCreate) return inflightCreate
    // 已有可用二维码时（StrictMode 二次挂载）只恢复轮询
    if (!freshRef.current && unikeyRef.current && sharedQrimg) {
      unikeyRef.current = sharedUnikey
      setQrimg(sharedQrimg)
      setStatus('waiting')
      schedulePoll(POLL_MS)
      return Promise.resolve(true)
    }
    return startCreate()
  }, [schedulePoll, startCreate])

  const refresh = useCallback((): Promise<boolean> => {
    sharedUnikey = ''
    sharedQrimg = ''
    unikeyRef.current = ''
    setQrimg('')
    return startCreate()
  }, [startCreate])

  useEffect(() => {
    mountedRef.current = true
    if (freshRef.current) {
      sharedUnikey = ''
      sharedQrimg = ''
      unikeyRef.current = ''
      setQrimg('')
      // 必须走 inflightCreate，否则 StrictMode 双挂载会并发打 qr/key
      void startCreate()
    } else {
      void create()
    }
    return () => {
      mountedRef.current = false
      stopPoll()
    }
  }, [create, startCreate, stopPoll])

  return { qrimg, status, error, refresh }
}
