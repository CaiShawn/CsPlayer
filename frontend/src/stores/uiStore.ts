import { create } from 'zustand'

/* ---------------------------------------------------------------------------
 * 全局 UI 状态：app 级轻提示（toast）。
 * 原先寄居 likesStore（一致性审计 C1）：但提示是全局能力——背景设置、右键
 * 菜单、音频引擎、播放器都在用，与「我喜欢」数据无关，故独立成 uiStore。
 * 语义：纯 UI 状态，不做账号隔离，切账号/登出不主动清除（Toast 自动消失）。
 * ------------------------------------------------------------------------ */

interface UiState {
  /** 当前轻提示文案；'' = 不显示 */
  toast: string
  setToast: (msg: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  toast: '',
  setToast: (msg) => set({ toast: msg }),
}))
