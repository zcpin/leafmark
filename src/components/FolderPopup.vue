<script setup lang="ts">
// A9 目录悬停弹窗：悬停文件夹即弹窗预览其内容
// - 鼠标进入弹窗保持显示（enter/leave 由父级 useHoverIntent 统一管理）
// - 子文件夹在弹窗内悬停级联展开（事件委托 + 手写 hover-intent）
// - Esc / 滚动 / 打开书签后整链关闭（close 事件逐级向上冒泡）
// - 视口边缘自动翻转；max-height 滚动；懒渲染（v-if 由父级控制）
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { faviconUrl } from '@/lib/favicon'
import { t } from '@/lib/i18n'
import { openUrl } from '@/lib/tabs'
import { findNode, isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useSettingsStore } from '@/stores/settings'

import Icon from './Icon.vue'

const props = defineProps<{
  anchor: HTMLElement
  folder: BookmarkNode
  level?: number
}>()

const emit = defineEmits<{ enter: []; leave: []; close: [] }>()

const settings = useSettingsStore()

const root = ref<HTMLElement>()
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
const children = computed(() => props.folder.children ?? [])

/** 级联子弹窗：{ id, 挂载锚点行元素 } */
const child = ref<{ id: string; anchor: HTMLElement } | null>(null)

let openTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined

function clearChildTimers() {
  clearTimeout(openTimer)
  clearTimeout(closeTimer)
  openTimer = undefined
  closeTimer = undefined
}

// —— 级联悬停（事件委托，避免 v-for 内逐行 composable）——
function scheduleChildOpen(id: string, row: HTMLElement) {
  clearTimeout(closeTimer)
  if (child.value?.id === id) return
  clearTimeout(openTimer)
  openTimer = setTimeout(() => {
    child.value = { id, anchor: row }
  }, 250)
}

function scheduleChildClose(id: string) {
  clearTimeout(openTimer)
  if (child.value?.id !== id) return
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    if (child.value?.id === id) child.value = null
  }, 200)
}

function onRowOver(event: MouseEvent) {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-folder-id]')
  if (row) scheduleChildOpen(row.dataset.folderId!, row)
}

function onRowOut(event: MouseEvent) {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-folder-id]')
  if (row) scheduleChildClose(row.dataset.folderId!)
}

/** 触屏兜底：单击文件夹行立即展开 */
function onRowClick(event: MouseEvent) {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-folder-id]')
  if (!row) return
  clearChildTimers()
  child.value = { id: row.dataset.folderId!, anchor: row }
}

function openBookmark(node: BookmarkNode) {
  if (!node.url) return
  openUrl(node.url, settings.openInNewTab)
  emit('close')
}

// —— 定位：level 0 在卡片下方展开，级联层在右侧展开；视口翻转 ——
function position() {
  const el = root.value
  if (!el) return
  const rect = props.anchor.getBoundingClientRect()
  const { offsetWidth: w, offsetHeight: h } = el
  const margin = 8

  let x: number
  let y: number
  if ((props.level ?? 0) === 0) {
    x = rect.left
    y = rect.bottom + margin
    if (y + h > window.innerHeight - margin) y = Math.max(margin, rect.top - h - margin)
  } else {
    x = rect.right + margin
    y = rect.top - 4
    if (x + w > window.innerWidth - margin) x = Math.max(margin, rect.left - w - margin)
    if (y + h > window.innerHeight - margin) y = Math.max(margin, window.innerHeight - h - margin)
  }
  if (x + w > window.innerWidth - margin) x = Math.max(margin, window.innerWidth - w - margin)

  pos.value = { left: `${x}px`, top: `${y}px`, visibility: 'visible' }
}

// —— Esc / 滚动关闭 ——
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function onScroll() {
  emit('close')
}

onMounted(async () => {
  await nextTick()
  position()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
})

onBeforeUnmount(() => {
  clearChildTimers()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <div
    ref="root"
    class="glass-strong fixed z-40 max-h-[60vh] w-72 overflow-y-auto rounded-xl p-1.5 text-sm"
    :style="pos"
    @mouseenter="emit('enter')"
    @mouseleave="emit('leave')"
    @mouseover="onRowOver"
    @mouseout="onRowOut"
    @contextmenu.prevent
  >
    <div v-if="children.length === 0" class="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
      {{ t('emptyFolder') }}
    </div>

    <template v-else>
      <template v-for="node in children" :key="node.id">
        <!-- 书签行 -->
        <button
          v-if="!isFolder(node)"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/10"
          :title="node.title"
          @click="openBookmark(node)"
        >
          <img
            :src="faviconUrl(node.url ?? '')"
            alt=""
            class="size-4 shrink-0 rounded-sm"
            @error="(e: Event) => ((e.target as HTMLElement).style.display = 'none')"
          />
          <span class="truncate">{{ node.title }}</span>
        </button>

        <!-- 文件夹行（悬停级联展开） -->
        <button
          v-else
          type="button"
          :data-folder-id="node.id"
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium text-slate-700 transition-colors hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/10"
          :class="{ 'bg-slate-500/10 dark:bg-white/10': child?.id === node.id }"
          :title="node.title"
          @click="onRowClick"
        >
          <Icon name="folder" class="size-4 shrink-0 text-amber-500 dark:text-amber-400" />
          <span class="flex-1 truncate">{{ node.title }}</span>
          <Icon name="chevronRight" class="size-3.5 shrink-0 text-slate-400" />
        </button>
      </template>
    </template>

    <!-- 级联子弹窗（自引用递归） -->
    <Teleport to="body">
      <FolderPopup
        v-if="child"
        :key="child.id"
        :anchor="child.anchor"
        :folder="findNode(children, child.id) ?? { id: child.id, title: '', children: [] }"
        :level="(props.level ?? 0) + 1"
        @enter="clearChildTimers"
        @leave="child && scheduleChildClose(child.id)"
        @close="child = null; emit('close')"
      />
    </Teleport>
  </div>
</template>
