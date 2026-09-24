import { api, http } from './client'

export { setUnauthorizedHandler, ApiError } from './client'

import type { NcmCred } from '../utils/cred'

import type {
  AlbumBrief,
  AlbumDetail,
  ArtistDetail,
  LikeResult,
  LikedSongs,
  Lyric,
  PlaylistDetail,
  QrStatus,
  SearchResult,
  SearchType,
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
    http.post<{ status: QrStatus; user?: UserProfile; cred?: NcmCred }>(
      '/api/auth/qr/check',
      { unikey },
    ),
  /** 用浏览器保存的凭证重建会话（不走 requestWithAuth，避免 401 触发登出回调造成循环） */
  restore: (cred: NcmCred) => http.post<{ user: UserProfile }>('/api/auth/restore', { cred }),
  me: () => api.get<UserProfile>('/api/auth/me'),
  logout: () => api.post<Record<string, never>>('/api/auth/logout'),
}

export const libraryApi = {
  playlists: () =>
    api.get<{ created: PlaylistBrief[]; subscribed: PlaylistBrief[] }>(
      '/api/user/playlists',
    ),
  /** 收藏专辑分页：每批 30 张，滚动到底续拉（offset=已加载数） */
  albums: (offset = 0, limit = 30) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    return api.get<{ items: AlbumBrief[]; hasMore: boolean; total: number }>(
      `/api/user/albums?${params.toString()}`,
    )
  },
  playlistDetail: (id: number) => api.get<PlaylistDetail>(`/api/playlist/${id}`),
  albumDetail: (id: number) => api.get<AlbumDetail>(`/api/album/${id}`),
  /** 我喜欢分页：每批 30 首，滚动到底续拉（offset=已加载数） */
  likes: (offset = 0, limit = 30) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    return api.get<LikedSongs>(`/api/user/likes?${params.toString()}`)
  },
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

export const searchApi = {
  search: <T>(kw: string, type: SearchType, limit = 30, offset = 0) => {
    const params = new URLSearchParams({
      kw,
      type,
      limit: String(limit),
      offset: String(offset),
    })
    return api.get<SearchResult<T>>(`/api/search?${params.toString()}`)
  },
  artist: (id: number) => api.get<ArtistDetail>(`/api/artist/${id}`),
  /** 歌手专辑分页（歌手页每页 30 张 + 加载更多） */
  artistAlbums: (id: number, offset = 0, limit = 30) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    return api.get<SearchResult<AlbumBrief>>(`/api/artist/${id}/albums?${params.toString()}`)
  },
}
