<script setup lang="ts">
// 书签卡片：主页面与 A9 弹出面板共用
// - 文件夹变体：悬停 ~250ms 弹出「卡片网格面板」（与主页面页签样式一致，多列换行、无滚动条）
// - 面板内文件夹卡片悬停继续级联（自引用递归），级联层在右侧展开
// - 书签变体：点击按 G5 打开；右键菜单（A2/B1/B4）
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  watch,
  type InjectionKey,
} from 'vue'

import { useHoverIntent } from '@/composables/useHoverIntent'
import { executeBookmarkAction } from '@/lib/bookmark-actions'
import { cardDropZone, resolveCardDrop, type CardDropZone } from '@/lib/drag-utils'
import { faviconUrl } from '@/lib/favicon'
import { t } from '@/lib/i18n'
import { openAllInGroup, openUrl } from '@/lib/tabs'
import { computePopupPosition } from '@/lib/popup-position'
import { isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useDeletionsStore } from '@/stores/deletions'

import ContextMenu, { type MenuItem } from './ContextMenu.vue'
import Icon from './Icon.vue'

/** 面板上下文：面板内的卡片打开书签 / 按 Esc / 滚动时，向上逐级关闭整链弹窗 */
const POPUP_CHAIN: InjectionKey<() => void> = Symbol('popup-chain')
/** 是否处于弹出面板内（级联层的展开方向为右侧） */
const IN_POPUP: InjectionKey<boolean> = Symbol('in-popup')

const props = defineProps<{ node: BookmarkNode }>()

const bookmarks = useBookmarksStore()
const settings = useSettingsStore()
const ui = useUiStore()
const deletions = useDeletionsStore()

const isDir = computed(() => isFolder(props.node))
const children = computed(() => props.node.children ?? [])

const cardEl = ref<HTMLElement>()
const intent = useHoverIntent()

// —— 面板上下文注入（对面板内的子卡片生效）——
const closeChain = inject(POPUP_CHAIN, null)
const inPopup = inject(IN_POPUP, false)

provide(POPUP_CHAIN, () => {
  intent.closeNow()
  closeChain?.()
})
provide(IN_POPUP, true)

// favicon：扩展环境走 _favicon；开发预览/加载失败回退首字母头像（零网络请求）
const favFailed = ref(false)
watch(
  () => props.node.url,
  () => {
    favFailed.value = false
  },
)
const favSrc = computed(() =>
  !isDir.value && !favFailed.value ? faviconUrl(props.node.url ?? '') : '',
)
const initial = computed(() => (props.node.title.trim().charAt(0) || '?').toUpperCase())

function onOpenBookmark(event?: MouseEvent | KeyboardEvent) {
  if (!props.node.url) return
  const shortcut = event && (event.ctrlKey || event.metaKey || ('button' in event && event.button === 1))
  if (shortcut) openUrl(props.node.url, true, !!event.shiftKey)
  else {
    openUrl(props.node.url, settings.openInNewTab)
    closeChain?.()
  }
}

function onCardClick(event: MouseEvent) {
  if (event.button !== 0) return
  if (isDir.value) onFolderClick()
  else { event.preventDefault(); onOpenBookmark(event) }
}

function onAuxClick(event: MouseEvent) {
  if (event.button !== 1 || isDir.value) return
  event.preventDefault()
  onOpenBookmark(event)
}

function onCardKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || (event.key === ' ' && isDir.value)) {
    event.preventDefault()
    if (isDir.value) onFolderClick()
    else onOpenBookmark(event)
  } else if (event.key === 'Escape') {
    intent.closeNow()
    closeChain?.()
  }
}

/** 触屏兜底（A9 规格）：无 hover 场景下单击文件夹立即弹出 */
function onFolderClick() {
  if (!intent.isOpen.value) intent.openNow()
}

// —— A4 拖拽排序（HTML5 DnD，原生）——
// 拖拽进行中抑制悬停弹窗触发（A4 × A9 互斥）
const dragging = ref(false)
const dropZone = ref<CardDropZone | null>(null)

if (isDir.value) {
  watch(() => bookmarks.draggingId, (id, previous) => {
    if (previous && !id) intent.closeNow()
  })
}

function onDragStart(e: DragEvent) {
  dragging.value = true
  bookmarks.draggingId = props.node.id
  intent.closeNow()
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', props.node.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragEnd() {
  dragging.value = false
  dropZone.value = null
  if (bookmarks.draggingId === props.node.id) bookmarks.draggingId = null
}

function onDragOver(e: DragEvent) {
  const rect = cardEl.value?.getBoundingClientRect()
  if (!rect) return
  const zone = cardDropZone(e.clientX, rect.left, rect.width, isDir.value)
  const sourceId = bookmarks.draggingId || e.dataTransfer?.getData('text/plain')
  if (!sourceId || !resolveCardDrop(bookmarks.tree, sourceId, props.node.id, zone)) {
    dropZone.value = null
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    return
  }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropZone.value = zone
}

function onDragLeave(e: DragEvent) {
  if (e.relatedTarget instanceof Node && cardEl.value?.contains(e.relatedTarget)) return
  dropZone.value = null
}

/** 落点与视觉提示使用同一规则，目标位置来自实际父目录（包含级联面板）。 */
async function onDrop(e: DragEvent) {
  e.preventDefault()
  const sourceId = e.dataTransfer?.getData('text/plain')
  const rect = cardEl.value?.getBoundingClientRect()
  const zone = rect ? cardDropZone(e.clientX, rect.left, rect.width, isDir.value) : isDir.value ? 'inside' : 'after'
  dropZone.value = null
  try {
    if (!sourceId) return
    const destination = resolveCardDrop(bookmarks.tree, sourceId, props.node.id, zone)
    if (destination) await bookmarks.moveBookmark(sourceId, destination.parentId, destination.index)
  } catch {
    ui.toast(t('bookmarkMoveFailed'))
    await bookmarks.load()
  } finally {
    bookmarks.draggingId = null
  }
}

// —— A9 弹出面板定位：主页面卡片在下方展开，级联层在右侧；视口边缘翻转 ——
const panelEl = ref<HTMLElement>()
const panelPos = ref<Record<string, string>>({ visibility: 'hidden' })

function positionPanel() {
  const el = panelEl.value
  const anchor = cardEl.value
  if (!el || !anchor) return
  const rect = anchor.getBoundingClientRect()
  const { offsetWidth: w, offsetHeight: h } = el
  const margin = 8

  const { left, top } = computePopupPosition(
    rect,
    { width: w, height: h },
    { width: window.innerWidth, height: window.innerHeight },
    inPopup,
    margin,
  )
  panelPos.value = { left: `${left}px`, top: `${top}px`, visibility: 'visible' }
}

function onPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeChain?.()
}

function onPanelScroll() {
  if (bookmarks.draggingId) return
  closeChain?.()
}

watch(
  () => intent.isOpen.value,
  async (open) => {
    if (open) {
      await nextTick()
      positionPanel()
      window.addEventListener('keydown', onPanelKeydown)
      window.addEventListener('scroll', onPanelScroll, { capture: true, passive: true })
    } else {
      window.removeEventListener('keydown', onPanelKeydown)
      window.removeEventListener('scroll', onPanelScroll, true)
    }
  },
)

onBeforeUnmount(() => {
  if (bookmarks.draggingId === props.node.id) bookmarks.draggingId = null
  window.removeEventListener('keydown', onPanelKeydown)
  window.removeEventListener('scroll', onPanelScroll, true)
})

// —— 右键菜单 ——
const menu = ref<{ x: number; y: number } | null>(null)

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  intent.closeNow()
  menu.value = { x: e.clientX, y: e.clientY }
}

const menuItems = computed<MenuItem[]>(() =>
  isDir.value
    ? [
        settings.homeFolderId === props.node.id
          ? { key: 'resetHome', label: t('resetHome'), icon: 'home' }
          : { key: 'home', label: t('setAsHome'), icon: 'home' },
        { key: 'openAll', label: t('openAll'), icon: 'externalLink' },
        { key: 'edit', label: t('edit'), icon: 'edit' },
        { key: 'delete', label: t('delete'), icon: 'trash', danger: true },
      ]
    : [
        settings.openInNewTab
          ? { key: 'openCurrent', label: t('openInCurrentTab'), icon: 'externalLink' }
          : { key: 'openNew', label: t('openInNewTab'), icon: 'externalLink' },
        { key: 'copy', label: t('copyUrl'), icon: 'copy' },
        { key: 'qr', label: t('qrCode'), icon: 'externalLink' },
        { key: 'edit', label: t('edit'), icon: 'edit' },
        { key: 'delete', label: t('delete'), icon: 'trash', danger: true },
      ],
)

async function onMenuSelect(key: string) {
  menu.value = null
  await executeBookmarkAction(key, {
    node: props.node,
    isFolder: isDir.value,
    settings,
    bookmarks,
    ui,
    openUrl,
    openAllInGroup,
    clipboard: navigator.clipboard,
    deleteBookmarks: deletions.remove,
  })
}
</script>

<template>
  <div
    ref="cardEl"
    class="glass bookmark-card group relative flex cursor-pointer items-center gap-3 rounded-xl px-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:ring-2 hover:ring-emerald-400/40 focus-visible:outline-2 focus-visible:outline-emerald-500"
    :class="{
      'ring-2 ring-emerald-500/60 opacity-50': dragging,
    }"
    :data-drop-zone="dropZone"
    :role="isDir ? 'button' : 'link'"
    :aria-label="props.node.title"
    :aria-expanded="isDir ? intent.isOpen.value : undefined"
    tabindex="0"
    style="height: var(--lm-card-height, 48px)"
    draggable="true"
    @contextmenu="onContextMenu"
    @mouseenter="isDir && !bookmarks.draggingId && intent.enter()"
    @mouseleave="isDir && !bookmarks.draggingId && intent.leave()"
    @click="onCardClick"
    @auxclick="onAuxClick"
    @mousedown.middle.prevent
    @keydown="onCardKeydown"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.stop="onDragOver"
    @dragleave.stop="onDragLeave"
    @drop.stop="onDrop"
  >
    <!-- 文件夹 -->
    <template v-if="isDir">
      <Icon name="folder" class="size-5 shrink-0 text-amber-500 dark:text-amber-400" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
        {{ props.node.title }}
      </span>
      <span
        v-if="props.node.children?.length"
        class="shrink-0 rounded-full bg-slate-500/10 px-2 py-0.5 text-xs tabular-nums text-slate-500 dark:bg-white/10 dark:text-slate-400"
      >
        {{ props.node.children.length }}
      </span>
    </template>

    <!-- 书签 -->
    <template v-else>
      <img
        v-if="favSrc"
        :src="favSrc"
        alt=""
        class="size-5 shrink-0 rounded-sm"
        @error="favFailed = true"
      />
      <span
        v-else
        class="flex size-5 shrink-0 items-center justify-center rounded-sm bg-emerald-500/15 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
      >
        {{ initial }}
      </span>
      <span
        class="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200"
        :title="props.node.title"
      >
        {{ props.node.title }}
      </span>
    </template>

    <!-- A9 弹出面板：卡片网格（与主页面页签一致，多列换行、无滚动条），自引用实现级联 -->
    <Teleport to="body">
      <div
        v-if="isDir && intent.isOpen.value && cardEl"
        ref="panelEl"
        class="glass-strong fixed z-40 rounded-2xl p-3"
        :style="panelPos"
        @mouseenter="intent.enter"
        @mouseleave="!bookmarks.draggingId && intent.leave()"
        @contextmenu.prevent
      >
        <div
          v-if="children.length === 0"
          class="px-8 py-6 text-center text-xs text-slate-400 dark:text-slate-500"
        >
          {{ t('emptyFolder') }}
        </div>
        <div
          v-else
          class="grid gap-2.5"
          style="
            width: min(520px, calc(100vw - 48px));
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          "
        >
          <BookmarkCard v-for="child in children" :key="child.id" :node="child" />
        </div>
      </div>
    </Teleport>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <ContextMenu
        v-if="menu"
        :x="menu.x"
        :y="menu.y"
        :items="menuItems"
        @select="onMenuSelect"
        @close="menu = null"
      />
    </Teleport>
  </div>
</template>
