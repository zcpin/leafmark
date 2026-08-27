// A9 目录悬停弹窗的交互核心
// 规格（docs/02-决定 功能细化）：悬停 ~250ms 打开（防误触）；
// 离开「锚点 + 弹窗」整体 ~200ms 宽限后收起（允许斜向移动）
import { onScopeDispose, ref } from 'vue'

export interface HoverIntentOptions {
  /** 悬停多久后打开（ms），默认 250 */
  openDelay?: number
  /** 离开多久后收起（ms），默认 200 */
  closeDelay?: number
}

export function useHoverIntent(options: HoverIntentOptions = {}) {
  const { openDelay = 250, closeDelay = 200 } = options

  const isOpen = ref(false)
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers() {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    openTimer = undefined
    closeTimer = undefined
  }

  /** 鼠标进入锚点或弹窗：取消收起计划；未打开则安排打开 */
  function enter() {
    clearTimeout(closeTimer)
    closeTimer = undefined
    if (isOpen.value) return
    clearTimeout(openTimer)
    openTimer = setTimeout(() => {
      isOpen.value = true
    }, openDelay)
  }

  /** 鼠标离开锚点或弹窗：取消打开计划；已打开则宽限后收起 */
  function leave() {
    clearTimeout(openTimer)
    openTimer = undefined
    if (!isOpen.value) return
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      isOpen.value = false
    }, closeDelay)
  }

  /** 立即关闭（Esc / 滚动 / 打开书签后） */
  function closeNow() {
    clearTimers()
    isOpen.value = false
  }

  /** 立即打开（触屏兜底：无 hover 时单击文件夹即弹出） */
  function openNow() {
    clearTimers()
    isOpen.value = true
  }

  onScopeDispose(clearTimers)

  return { isOpen, enter, leave, closeNow, openNow }
}
