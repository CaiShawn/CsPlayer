import type { ApiResponse } from '../types'

export class ApiError extends Error {
  code: number
  status: number

  constructor(code: number, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  let body: ApiResponse<T> | null = null
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(5000, '响应解析失败', res.status)
  }

  if (!res.ok) {
    const detail = (body as unknown as { detail?: { code?: number; message?: string } })
      ?.detail
    throw new ApiError(
      detail?.code ?? body?.code ?? res.status,
      detail?.message ?? body?.message ?? res.statusText,
      res.status,
    )
  }

  if (body.code !== 0) {
    throw new ApiError(body.code, body.message || '业务错误', res.status)
  }

  return body.data
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
}

/** Central 401 handler hook */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

const rawRequest = request
export async function requestWithAuth<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawRequest<T>(path, init)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      onUnauthorized?.()
    }
    throw e
  }
}

export const api = {
  get: <T>(path: string) => requestWithAuth<T>(path),
  post: <T>(path: string, data?: unknown) =>
    requestWithAuth<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
}
