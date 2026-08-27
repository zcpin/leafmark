// UI 全局状态：确认对话框 / 编辑对话框 / Toast
// 组件（ConfirmDialog / EditBookmarkDialog / ToastStack）挂在 App 根部消费
import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}

export interface EditResult {
  title: string
  url?: string
}

interface EditState {
  id: string
  title: string
  url?: string
  isFolder: boolean
}

let seq = 0

export const useUiStore = defineStore('ui', () => {
  const confirmVisible = ref(false)
  const confirmOptions = ref<ConfirmOptions>({ title: '', message: '' })
  let confirmResolver: ((value: boolean) => void) | null = null

  const editVisible = ref(false)
  const editState = ref<EditState | null>(null)
  let editResolver: ((value: EditResult | null) => void) | null = null

  const toasts = ref<{ id: number; message: string }[]>([])

  /** 弹出确认框，resolve(true) = 用户确认 */
  function confirm(options: ConfirmOptions): Promise<boolean> {
    confirmOptions.value = options
    confirmVisible.value = true
    return new Promise((resolve) => {
      confirmResolver = resolve
    })
  }

  function resolveConfirm(value: boolean) {
    confirmVisible.value = false
    confirmResolver?.(value)
    confirmResolver = null
  }

  /** 弹出编辑框（B4），resolve(null) = 取消 */
  function openEdit(state: EditState): Promise<EditResult | null> {
    editState.value = state
    editVisible.value = true
    return new Promise((resolve) => {
      editResolver = resolve
    })
  }

  function resolveEdit(result: EditResult | null) {
    editVisible.value = false
    editResolver?.(result)
    editResolver = null
    editState.value = null
  }

  /** 轻提示（复制成功等），2.5s 自动消失 */
  function toast(message: string) {
    const id = ++seq
    toasts.value = [...toasts.value, { id, message }]
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 2500)
  }

  return {
    confirmVisible,
    confirmOptions,
    editVisible,
    editState,
    toasts,
    confirm,
    resolveConfirm,
    openEdit,
    resolveEdit,
    toast,
  }
})
