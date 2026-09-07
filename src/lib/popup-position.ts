// 悬停面板的纯几何计算：不依赖 DOM，便于单测和复用
export interface AnchorRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface PopupSize {
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface PopupPosition {
  left: number
  top: number
}

/**
 * 计算主面板/级联面板的位置，并在视口边缘翻转或内收。
 * 主面板默认向下，级联面板默认向右；margin 与现有交互规格保持一致。
 */
export function computePopupPosition(
  anchor: AnchorRect,
  popup: PopupSize,
  viewport: ViewportSize,
  inPopup: boolean,
  margin = 8,
): PopupPosition {
  let left = inPopup ? anchor.right + margin : anchor.left
  let top = inPopup ? anchor.top - 4 : anchor.bottom + margin

  if (top + popup.height > viewport.height - margin) {
    top = Math.max(margin, anchor.top - popup.height - margin)
  }
  if (left + popup.width > viewport.width - margin) {
    left = inPopup
      ? Math.max(margin, anchor.left - popup.width - margin)
      : viewport.width - popup.width - margin
  }
  if (left < margin) left = margin

  return { left, top }
}
