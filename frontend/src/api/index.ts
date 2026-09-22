import { api, http } from './client'

export { setUnauthorizedHandler, ApiError } from './client'

import type {
  AlbumBrief,
  AlbumDetail,
  LikeResult,
  LikedSongs,
  Lyric,
  PlaylistDetail,
  QrStatus,
  SongUrl,
  QualityLevel,
  UserProfile,
  PlaylistBrief,
  RecordItem,
} from '../types'

export const authApi = {
  qrKey: () => http.post<{ unikey: string }>('/api/auth/qr/key'),
  qrCreate: (unikey: string) =>
    http.post<{ unikey: string; qrimg: string }>('/api/auth/qr/create', { unikey }),
  qrCheck: (unikey: string) =>
    http.post<{ status: QrStatus; user?: UserProfile }>('/api/auth/qr/check', { unikey }),
  me: () => api.get<UserProfile>('/api/auth/me'),
  logout: () => api.post<Record<string, never>>('/api/auth/logout'),
}

export const libraryApi = {
  playlists: () =>
    api.get<{ created: PlaylistBrief[]; subscribed: PlaylistBrief[] }>(
      '/api/user/playlists',
    ),
  albums: (offset = 0, limit?: number) => {
    const params = new URLSearchParams({ offset: String(offset) })
    if (limit != null) params.set('limit', String(limit))
    return api.get<{ items: AlbumBrief[]; hasMore: boolean; total: number }>(
      `/api/user/albums?${params.toString()}`,
    )
  },
  playlistDetail: (id: number) => api.get<PlaylistDetail>(`/api/playlist/${id}`),
  albumDetail: (id: number) => api.get<AlbumDetail>(`/api/album/${id}`),
  likes: () => api.get<LikedSongs>('/api/user/likes'),
  likedIds: () => api.get<{ ids: number[] }>('/api/user/liked-ids'),
  record: (type: 'all' | 'week' = 'all', limit = 50) =>
    api.get<RecordItem[]>(`/api/user/record?type=${type}&limit=${limit}`),
}

export const songApi = {
  url: (id: number, level?: QualityLevel | string) =>
    api.get<SongUrl>(
      level ? `/api/song/${id}/url?level=${encodeURIComponent(level)}` : `/api/song/${id}/url`,
    ),
  lyric: (id: number) => api.get<Lyric>(`/api/song/${id}/lyric`),
  like: (id: number, like: boolean) =>
    api.post<LikeResult>(`/api/song/${id}/like`, { like }),
}
