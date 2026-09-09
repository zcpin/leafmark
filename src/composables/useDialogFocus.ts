import { nextTick, ref, useId, watch, type ComponentPublicInstance, type Ref } from 'vue'

const dialogs: Array<{ panel: Ref<HTMLElement | undefined> }> = []
const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** 浮层共用焦点生命周期，嵌套时只有最上层处理键盘和焦点。 */
export function useDialogFocus(visible: () => boolean, close: () => void) {
  const panel = ref<HTMLElement>()
  const setPanel = (element: Element | ComponentPublicInstance | null) => {
    panel.value = element instanceof HTMLElement ? element : undefined
  }
  const titleId = useId()
  const entry = { panel }
  const isTop = () => dialogs[dialogs.length - 1] === entry
  const controls = () =>
    Array.from(panel.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.closest('[hidden], [inert]') &&
        element.getClientRects().length > 0,
    )
  const focusFirst = () => (controls()[0] ?? panel.value)?.focus({ preventScroll: true })

  watch(
    visible,
    (open, _previous, onCleanup) => {
      if (!open) return
      const previousFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      let active = true
      dialogs.push(entry)

      const onKeydown = (event: KeyboardEvent) => {
        if (!isTop()) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopImmediatePropagation()
          close()
        } else if (event.key === 'Tab') {
          const items = controls()
          const first = items[0]
          const last = items[items.length - 1]
          if (!first || !panel.value?.contains(document.activeElement)) {
            event.preventDefault()
            focusFirst()
          } else if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === panel.value)
          ) {
            event.preventDefault()
            last?.focus()
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === panel.value)
          ) {
            event.preventDefault()
            first.focus()
          }
        }
      }
      const onFocus = (event: FocusEvent) => {
        if (isTop() && panel.value && !panel.value.contains(event.target as Node)) focusFirst()
      }
      document.addEventListener('keydown', onKeydown, true)
      document.addEventListener('focusin', onFocus, true)
      onCleanup(() => {
        active = false
        const wasTop = isTop()
        const index = dialogs.indexOf(entry)
        if (index >= 0) dialogs.splice(index, 1)
        document.removeEventListener('keydown', onKeydown, true)
        document.removeEventListener('focusin', onFocus, true)
        void nextTick(() => {
          const current = dialogs[dialogs.length - 1]?.panel.value
          if (wasTop && previousFocus?.isConnected && (!current || current.contains(previousFocus)))
            previousFocus.focus({ preventScroll: true })
        })
      })
      void nextTick(() => {
        if (active && isTop()) focusFirst()
      })
    },
    // pre 将焦点移动排在本次 DOM 更新之后，同时保留打开前的焦点。
    { immediate: true, flush: 'pre' },
  )

  return { setPanel, titleId }
}
