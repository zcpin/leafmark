// A9 悬停面板：分页 + 定位 + 全局关闭监听（从 BookmarkCard 抽出）
// 主页面卡片在下方展开，级联层在右侧；视口边缘自动翻转
import { computed, nextTick, ref, watch, type Ref } from 'vue'

import { computePopupPosition, popupPageSize } from '@/lib/popup-position'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'

export interface UseFolderPanelOptions {
  /** 是否启用面板逻辑（非文件夹卡片不需要注册监听） */
  enabled: () => boolean
  children: () => BookmarkNode[]
  /** 锚点元素 */
  cardEl: Ref<HTMLElement | undefined>
  /** 面板元素；模板 ref 用 useTemplateRef 绑定后传入 */
  panelEl: Readonly<Ref<HTMLElement | null>>
  /** 悬停意图的打开状态 */
  isOpen: Ref<boolean>
  /** 级联链标识：点击该链之外的区域时关闭 */
  chainId: string
  /** 面板位于级联层（右侧展开）还是主页面（下方展开） */
  inPopup: boolean
  onClose: (restoreFocus?: boolean) => void
}

export function useFolderPanel(options: UseFolderPanelOptions) {
  const bookmarks = useBookmarksStore()
  const settings = useSettingsStore()

  const panelPos = ref<Record<string, string>>({ visibility: 'hidden' })
  const panelPage = ref(0)
  const pageSize = ref(1)

  const pageCount = computed(() =>
    Math.max(1, Math.ceil(options.children().length / pageSize.value)),
  )
  const pageChildren = computed(() => {
    const list = options.children()
    return list.slice(panelPage.value * pageSize.value, (panelPage.value + 1) * pageSize.value)
  })

  function positionPanel() {
    const el = options.panelEl.value
    const anchor = options.cardEl.value
    if (!el || !anchor) return
    const rect = anchor.getBoundingClientRect()
    const { offsetWidth: w, offsetHeight: h } = el
    const margin = 8

    const { left, top } = computePopupPosition(
      rect,
      { width: w, height: h },
      { width: window.innerWidth, height: window.innerHeight },
      options.inPopup,
      margin,
    )
    panelPos.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
  }

  function updatePanelSize() {
    if (!options.isOpen.value) return
    pageSize.value = popupPageSize(
      { width: window.innerWidth, height: window.innerHeight },
      settings.layout.cardHeight,
    )
    panelPage.value = Math.min(panelPage.value, pageCount.value - 1)
    void nextTick(() => {
      if (options.isOpen.value) positionPanel()
    })
  }

  function onPanelKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      options.onClose(true)
    }
  }

  function onPanelScroll() {
    if (bookmarks.draggingId) return
    options.onClose()
  }

  function onOutsidePointer(e: PointerEvent) {
    const target = e.target instanceof Element ? e.target : null
    if (target?.closest('[data-popup-chain]')?.getAttribute('data-popup-chain') !== options.chainId)
      options.onClose()
  }

  if (options.enabled()) {
    watch([() => options.children(), () => settings.layout.cardHeight, panelPage], updatePanelSize)
  }

  watch(options.isOpen, (open, _previous, onCleanup) => {
    if (!open) return
    panelPage.value = 0
    updatePanelSize()
    let active = true
    onCleanup(() => {
      active = false
      window.removeEventListener('keydown', onPanelKeydown)
      window.removeEventListener('scroll', onPanelScroll, true)
      window.removeEventListener('pointerdown', onOutsidePointer)
      window.removeEventListener('resize', updatePanelSize)
    })
    void nextTick(() => {
      if (!active) return
      positionPanel()
      window.addEventListener('keydown', onPanelKeydown)
      window.addEventListener('scroll', onPanelScroll, { capture: true, passive: true })
      window.addEventListener('pointerdown', onOutsidePointer)
      window.addEventListener('resize', updatePanelSize)
    })
  })

  return { panelPos, panelPage, pageCount, pageChildren }
}
