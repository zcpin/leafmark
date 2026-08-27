<script setup lang="ts">
// 通用右键菜单：毛玻璃浮层、视口边缘翻转、Esc/点击外部关闭
import { onBeforeUnmount, onMounted, ref } from 'vue'

import Icon, { type IconName } from './Icon.vue'

export interface MenuItem {
  key: string
  label: string
  icon?: IconName
  danger?: boolean
}

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ select: [key: string]; close: [] }>()

const root = ref<HTMLElement>()
const pos = ref({ left: `${props.x}px`, top: `${props.y}px` })

function reposition() {
  const el = root.value
  if (!el) return
  const { offsetWidth: w, offsetHeight: h } = el
  const left = Math.min(props.x, window.innerWidth - w - 8)
  const top = Math.min(props.y, window.innerHeight - h - 8)
  pos.value = { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` }
}

function onGlobalClick(e: MouseEvent) {
  if (!root.value?.contains(e.target as Node)) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  reposition()
  // 等当前 contextmenu 事件冒泡结束后再监听全局点击
  setTimeout(() => {
    window.addEventListener('mousedown', onGlobalClick)
    window.addEventListener('keydown', onKeydown)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onGlobalClick)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="root"
    class="glass-strong fixed z-50 min-w-44 rounded-xl p-1.5 text-sm"
    :style="pos"
    @contextmenu.prevent
    @click.stop
  >
    <button
      v-for="item in props.items"
      :key="item.key"
      type="button"
      class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors"
      :class="
        item.danger
          ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
          : 'text-slate-700 hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/10'
      "
      @click="emit('select', item.key)"
    >
      <Icon v-if="item.icon" :name="item.icon" />
      <span class="flex-1">{{ item.label }}</span>
    </button>
  </div>
</template>
