import { api, http } from './client'

export { setUnauthorizedHandler, ApiError } from './client'

import type {
  AlbumBrief,
  AlbumDetail,
  Lyric,
  PlaylistDetail,
  QrStatus,
  SongUrl,
  UserProfile,
  PlaylistBrief,
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
  albums: () => api.get<AlbumBrief[]>('/api/user/albums'),
  playlistDetail: (id: number) => api.get<PlaylistDetail>(`/api/playlist/${id}`),
  albumDetail: (id: number) => api.get<AlbumDetail>(`/api/album/${id}`),
}

export const songApi = {
  url: (id: number) => api.get<SongUrl>(`/api/song/${id}/url`),
  lyric: (id: number) => api.get<Lyric>(`/api/song/${id}/lyric`),
}
