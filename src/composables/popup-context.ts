import type { InjectionKey } from 'vue'

export interface PopupContext {
  rootId: string
  enter: () => void
  leave: () => void
  close: (restoreFocus?: boolean) => void
}

// 模块级 key 在所有递归卡片实例间共享。
export const POPUP_CONTEXT: InjectionKey<PopupContext> = Symbol('bookmark-popup')
