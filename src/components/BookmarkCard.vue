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
import { faviconUrl } from '@/lib/favicon'
import { t } from '@/lib/i18n'
import { openAllInGroup, openUrl } from '@/lib/tabs'
import { isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

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

function onOpenBookmark() {
  if (!props.node.url) return
  openUrl(props.node.url, settings.openInNewTab)
  closeChain?.()
}

/** 触屏兜底（A9 规格）：无 hover 场景下单击文件夹立即弹出 */
function onFolderClick() {
  if (!intent.isOpen.value) intent.openNow()
}

// —— A4 拖拽排序（HTML5 DnD，原生）——
// 拖拽进行中抑制悬停弹窗触发（A4 × A9 互斥）
const dragging = ref(false)
const dropOver = ref(false)

function onDragStart(e: DragEvent) {
  dragging.value = true
  intent.closeNow()
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', props.node.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragEnd() {
  dragging.value = false
  dropOver.value = false
}

function onDragOver(e: DragEvent) {
  // 允许 drop
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropOver.value = true
}

function onDragLeave() {
  dropOver.value = false
}

/** 落在卡片上：
 *  - 落在文件夹卡片 → 移入该文件夹（index 0）
 *  - 落在书签卡片 → 移到目标之后（目标父级的 index+1）
 *  落点与源位置相同则跳过写回（isSamePosition 由 store 层的 load 兜底，这里简化判断）
 */
async function onDrop(e: DragEvent) {
  e.preventDefault()
  dropOver.value = false
  const sourceId = e.dataTransfer?.getData('text/plain')
  if (!sourceId || sourceId === props.node.id) return

  if (isDir.value) {
    // 进入文件夹
    await bookmarks.moveBookmark(sourceId, props.node.id, 0)
  } else {
    // 同级重排：移到目标在父级中的位置之后
    const parent = props.node.parentId ?? '1'
    const siblings = bookmarks.currentChildren
    const targetIndex = siblings.findIndex((n) => n.id === props.node.id)
    await bookmarks.moveBookmark(sourceId, parent, targetIndex + 1)
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

  let x: number
  let y: number
  if (inPopup) {
    x = rect.right + margin
    y = rect.top - 4
  } else {
    x = rect.left
    y = rect.bottom + margin
  }
  if (y + h > window.innerHeight - margin) y = Math.max(margin, rect.top - h - margin)
  if (x + w > window.innerWidth - margin) {
    x = inPopup ? Math.max(margin, rect.left - w - margin) : window.innerWidth - w - margin
  }
  if (x < margin) x = margin

  panelPos.value = { left: `${x}px`, top: `${y}px`, visibility: 'visible' }
}

function onPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeChain?.()
}

function onPanelScroll() {
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
        { key: 'home', label: t('setAsHome'), icon: 'home' },
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
  const node = props.node

  if (key === 'openNew' && node.url) return openUrl(node.url, true)
  if (key === 'openCurrent' && node.url) return openUrl(node.url, false)

  if (key === 'openAll' && isDir.value) {
    const urls = bookmarks.collectFolderUrls(node.id)
    await openAllInGroup(urls, node.title)
    return
  }

  if (key === 'copy') {
    try {
      await navigator.clipboard.writeText(node.url ?? '')
      ui.toast(t('copied'))
    } catch {
      ui.toast(t('copyFailed'))
    }
    return
  }

  if (key === 'qr' && node.url) {
    await ui.openQr(node.url, node.title)
    return
  }

  if (key === 'home') {
    await settings.setHomeFolderId(node.id)
    bookmarks.setViewFolder(node.id)
    ui.toast(t('homeSet'))
    return
  }

  if (key === 'edit') {
    const result = await ui.openEdit({
      id: node.id,
      title: node.title,
      url: node.url,
      isFolder: isDir.value,
    })
    if (result) await bookmarks.updateBookmark(node.id, result)
    return
  }

  if (key === 'delete') {
    const confirmed = await ui.confirm({
      title: isDir.value ? t('deleteFolderTitle') : t('deleteBookmarkTitle'),
      message: isDir.value ? t('deleteFolderMessage') : t('deleteBookmarkMessage'),
    })
    if (confirmed) await bookmarks.removeBookmark(node.id, isDir.value)
  }
}
</script>

<template>
  <div
    ref="cardEl"
    class="glass flex h-12 cursor-pointer items-center gap-3 rounded-xl px-4 transition-all hover:ring-2 hover:ring-emerald-400/40"
    :class="{ 'ring-2 ring-emerald-500/60 opacity-50': dragging, 'ring-2 ring-emerald-400': dropOver }"
    draggable="true"
    @contextmenu="onContextMenu"
    @mouseenter="isDir && !dragging && intent.enter()"
    @mouseleave="isDir && intent.leave()"
    @click="isDir ? onFolderClick() : onOpenBookmark()"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
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
        @mouseleave="intent.leave"
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
          style="width: min(520px, calc(100vw - 48px)); grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))"
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
