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
  useId,
  useTemplateRef,
  watch,
} from 'vue'

import { useCardDrag } from '@/composables/useCardDrag'
import { useFolderPanel } from '@/composables/useFolderPanel'
import { useHoverIntent } from '@/composables/useHoverIntent'
import { POPUP_CONTEXT } from '@/composables/popup-context'
import { executeBookmarkAction } from '@/lib/bookmark-actions'
import { buildCardMenuItems, type CardMenuKey } from '@/lib/card-menu'
import { isMovableBookmark } from '@/lib/bookmark-move'
import { faviconUrl } from '@/lib/favicon'
import { t } from '@/lib/i18n'
import { openAllInGroup, openUrl } from '@/lib/tabs'
import { isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSearchStore } from '@/stores/search'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useDeletionsStore } from '@/stores/deletions'
import { useSelectionStore } from '@/stores/selection'

import ContextMenu from './ContextMenu.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  node: BookmarkNode
  /** 在网格中的序号；方向键导航用它定位（弹出面板内的卡片不传） */
  index?: number
  /** roving tabindex：网格内只有当前焦点项为 0 */
  tabIndex?: number
  /** 搜索结果里的所在文件夹标题链；仅在结果视图下渲染 */
  path?: string[]
  /** 结果视图：禁用悬停面板与拖拽，文件夹点击改为直接进入 */
  resultMode?: boolean
}>()

const bookmarks = useBookmarksStore()
const search = useSearchStore()
const settings = useSettingsStore()
const ui = useUiStore()
const deletions = useDeletionsStore()
const selection = useSelectionStore()
const selected = computed(() => selection.selectedIdSet.has(props.node.id))
const selectable = computed(() => isMovableBookmark(props.node))

const isDir = computed(() => isFolder(props.node))
const children = computed(() => props.node.children ?? [])

const cardEl = ref<HTMLElement>()
const intent = useHoverIntent()

// —— 面板上下文注入（对面板内的子卡片生效）——
const parentPopup = inject(POPUP_CONTEXT, null)
const rootId = parentPopup?.rootId ?? useId()
const inPopup = parentPopup !== null

function closeChain(restoreFocus = false) {
  intent.closeNow()
  if (parentPopup) parentPopup.close(restoreFocus)
  else if (restoreFocus) cardEl.value?.focus()
}

function enterPopup() {
  intent.enter()
  parentPopup?.enter()
}

function leavePopup() {
  if (bookmarks.draggingId) return
  intent.leave()
  parentPopup?.leave()
}

provide(POPUP_CONTEXT, { rootId, enter: enterPopup, leave: leavePopup, close: closeChain })

// —— A9 悬停面板：分页 / 定位 / 全局关闭监听都在 useFolderPanel ——
const panelEl = useTemplateRef<HTMLElement>('panelEl')
const { panelPos, panelPage, pageCount, pageChildren } = useFolderPanel({
  enabled: () => isDir.value,
  children: () => children.value,
  cardEl,
  panelEl,
  isOpen: intent.isOpen,
  chainId: rootId,
  inPopup,
  onClose: closeChain,
})

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
  const shortcut =
    event && (event.ctrlKey || event.metaKey || ('button' in event && event.button === 1))
  if (shortcut) openUrl(props.node.url, true, !!event.shiftKey)
  else {
    openUrl(props.node.url, settings.openInNewTab)
    closeChain()
  }
}

function onCardClick(event: MouseEvent) {
  if (event.button !== 0) return
  if (selection.active) {
    event.preventDefault()
    selection.toggle(props.node.id, event.shiftKey)
    return
  }
  if (isDir.value) onFolderClick()
  else {
    event.preventDefault()
    onOpenBookmark(event)
  }
}

function onAuxClick(event: MouseEvent) {
  if (selection.active) {
    event.preventDefault()
    return
  }
  if (event.button !== 1 || isDir.value) return
  event.preventDefault()
  onOpenBookmark(event)
}

function onCardKeydown(event: KeyboardEvent) {
  if (selection.active) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selection.toggle(props.node.id, event.shiftKey)
    }
    return
  }
  if (event.key === 'Enter' || (event.key === ' ' && isDir.value)) {
    event.preventDefault()
    if (isDir.value) onFolderClick()
    else onOpenBookmark(event)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeChain(true)
  }
}

/** 触屏兜底（A9 规格）：无 hover 场景下单击文件夹立即弹出 */
function onFolderClick() {
  // 结果视图里的文件夹卡片：直接进入该文件夹并结束搜索
  if (props.resultMode) {
    search.close()
    bookmarks.setViewFolder(props.node.id)
    return
  }
  if (!intent.isOpen.value) intent.openNow()
}

/** 结果视图里的路径副标题：跳到该书签所在目录并结束搜索 */
function openContainingFolder() {
  const parentId = props.node.parentId
  if (!parentId) return
  search.close()
  bookmarks.setViewFolder(parentId)
}

// —— A4 拖拽排序（HTML5 DnD，原生）——
// 拖拽进行中抑制悬停弹窗触发（A4 × A9 互斥）
const {
  dragging,
  dropZone,
  reset: resetDropZone,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
} = useCardDrag({
  node: () => props.node,
  isDir: () => isDir.value,
  resultMode: () => props.resultMode === true,
  cardEl,
  onBegin: () => intent.closeNow(),
})

// —— 右键菜单 ——
const menu = ref<{ x: number; y: number } | null>(null)

watch(
  () => selection.active,
  (active) => {
    if (active) {
      intent.closeNow()
      menu.value = null
      resetDropZone()
    }
  },
)

if (isDir.value) {
  watch(
    () => bookmarks.draggingId,
    (id, previous) => {
      if (previous && !id) intent.closeNow()
    },
  )
}

onBeforeUnmount(() => {
  if (bookmarks.draggingId === props.node.id) bookmarks.draggingId = null
})

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (selection.active) return
  intent.closeNow()
  menu.value = { x: e.clientX, y: e.clientY }
}

const menuItems = computed(() =>
  buildCardMenuItems({
    isFolder: isDir.value,
    isHomeFolder: settings.homeFolderId === props.node.id,
    openInNewTab: settings.openInNewTab,
    selectable: selectable.value,
  }),
)

async function onMenuSelect(key: CardMenuKey) {
  menu.value = null
  cardEl.value?.focus()
  if (key === 'select') {
    closeChain()
    selection.start(props.node)
    await nextTick()
    document.querySelector<HTMLElement>('.bookmark-card[aria-checked="true"]')?.focus()
    return
  }
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
    class="glass bookmark-card group relative flex cursor-pointer items-center gap-3 rounded-xl px-4 transition-all hover:ring-2 hover:ring-emerald-400/40 focus-visible:outline-2 focus-visible:outline-emerald-500"
    :class="{
      'ring-2 ring-emerald-500/60 opacity-50': dragging,
      'hover:-translate-y-0.5 hover:shadow-xl': !selection.active,
      'ring-2 ring-emerald-600 dark:ring-emerald-400': selection.active && selected,
      'cursor-not-allowed opacity-50': selection.active && !selectable,
    }"
    :data-drop-zone="dropZone"
    :data-popup-chain="rootId"
    :role="selection.active ? 'checkbox' : isDir ? 'button' : 'link'"
    :aria-label="props.node.title"
    :aria-expanded="!selection.active && isDir ? intent.isOpen.value : undefined"
    :aria-checked="selection.active ? selected : undefined"
    :aria-disabled="selection.active ? !selectable || selection.busy : undefined"
    :data-card-index="props.index"
    :tabindex="props.tabIndex ?? 0"
    style="height: var(--lm-card-height, 48px)"
    :draggable="!selection.active && !props.resultMode"
    @contextmenu="onContextMenu"
    @mouseenter="
      isDir && !props.resultMode && !selection.active && !bookmarks.draggingId && enterPopup()
    "
    @mouseleave="isDir && leavePopup()"
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
    <span
      v-if="selection.active"
      aria-hidden="true"
      class="flex size-4 shrink-0 items-center justify-center rounded border"
      :class="
        selected
          ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-slate-950'
          : 'border-slate-500 dark:border-slate-400'
      "
    >
      <Icon v-if="selected" name="check" class="size-3" />
    </span>
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

    <!-- 搜索结果：所在文件夹路径，点击进入该目录 -->
    <button
      v-if="props.resultMode && props.path && props.path.length > 0"
      type="button"
      class="hidden max-w-40 shrink-0 truncate rounded-md px-1.5 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-500/10 hover:text-slate-600 sm:block dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
      :title="props.path.join(' / ')"
      @click.stop="openContainingFolder"
      @keydown.enter.stop.prevent="openContainingFolder"
      @keydown.space.stop.prevent="openContainingFolder"
    >
      {{ props.path.join(' / ') }}
    </button>

    <!-- A9 弹出面板：卡片网格（与主页面页签一致，多列换行、无滚动条），自引用实现级联 -->
    <Teleport to="body">
      <div
        v-if="isDir && intent.isOpen.value && cardEl"
        ref="panelEl"
        :data-popup-chain="rootId"
        class="glass-strong fixed z-40 rounded-2xl p-3"
        :style="panelPos"
        @mouseenter="enterPopup"
        @mouseleave="leavePopup"
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
            grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
          "
        >
          <BookmarkCard v-for="child in pageChildren" :key="child.id" :node="child" />
        </div>
        <nav
          v-if="pageCount > 1"
          :aria-label="t('folderPages')"
          class="mt-3 flex h-7 items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
        >
          <button
            type="button"
            :aria-label="t('previousPage')"
            :disabled="panelPage === 0"
            class="size-7 rounded-md hover:bg-slate-500/10 disabled:opacity-30"
            @click="panelPage--"
          >
            ‹
          </button>
          <span
            aria-live="polite"
            :aria-label="t('folderPage', { page: panelPage + 1, total: pageCount })"
            >{{ panelPage + 1 }} / {{ pageCount }}</span
          >
          <button
            type="button"
            :aria-label="t('nextPage')"
            :disabled="panelPage === pageCount - 1"
            class="size-7 rounded-md hover:bg-slate-500/10 disabled:opacity-30"
            @click="panelPage++"
          >
            ›
          </button>
        </nav>
      </div>
    </Teleport>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <ContextMenu
        v-if="menu"
        :data-popup-chain="rootId"
        :x="menu.x"
        :y="menu.y"
        :items="menuItems"
        @mouseenter="parentPopup?.enter()"
        @mouseleave="parentPopup?.leave()"
        @select="onMenuSelect"
        @close="menu = null"
      />
    </Teleport>
  </div>
</template>
