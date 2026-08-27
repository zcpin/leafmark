<script setup lang="ts">
// 书签卡片：文件夹变体带 A9 悬停弹窗；书签变体按 G5 打开；右键菜单（A2/B1/B4）
import { computed, ref, watch } from 'vue'

import { useHoverIntent } from '@/composables/useHoverIntent'
import { faviconUrl } from '@/lib/favicon'
import { t } from '@/lib/i18n'
import { openUrl } from '@/lib/tabs'
import { isFolder } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

import ContextMenu, { type MenuItem } from './ContextMenu.vue'
import FolderPopup from './FolderPopup.vue'
import Icon from './Icon.vue'

const props = defineProps<{ node: BookmarkNode }>()

const bookmarks = useBookmarksStore()
const settings = useSettingsStore()
const ui = useUiStore()

const isDir = computed(() => isFolder(props.node))
const cardEl = ref<HTMLElement>()
const intent = useHoverIntent()

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
  if (props.node.url) openUrl(props.node.url, settings.openInNewTab)
}

/** 触屏兜底（A9 规格）：无 hover 场景下单击文件夹立即弹出 */
function onFolderClick() {
  if (!intent.isOpen.value) intent.openNow()
}

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
        { key: 'edit', label: t('edit'), icon: 'edit' },
        { key: 'delete', label: t('delete'), icon: 'trash', danger: true },
      ]
    : [
        settings.openInNewTab
          ? { key: 'openCurrent', label: t('openInCurrentTab'), icon: 'externalLink' }
          : { key: 'openNew', label: t('openInNewTab'), icon: 'externalLink' },
        { key: 'copy', label: t('copyUrl'), icon: 'copy' },
        { key: 'edit', label: t('edit'), icon: 'edit' },
        { key: 'delete', label: t('delete'), icon: 'trash', danger: true },
      ],
)

async function onMenuSelect(key: string) {
  menu.value = null
  const node = props.node

  if (key === 'openNew' && node.url) return openUrl(node.url, true)
  if (key === 'openCurrent' && node.url) return openUrl(node.url, false)

  if (key === 'copy') {
    try {
      await navigator.clipboard.writeText(node.url ?? '')
      ui.toast(t('copied'))
    } catch {
      ui.toast(t('copyFailed'))
    }
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
    @contextmenu="onContextMenu"
    @mouseenter="isDir && intent.enter()"
    @mouseleave="isDir && intent.leave()"
    @click="isDir ? onFolderClick() : onOpenBookmark()"
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
      <span class="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200" :title="props.node.title">
        {{ props.node.title }}
      </span>
    </template>

    <!-- A9 目录悬停弹窗 -->
    <Teleport to="body">
      <FolderPopup
        v-if="isDir && intent.isOpen.value && cardEl"
        :anchor="cardEl"
        :folder="props.node"
        @enter="intent.enter"
        @leave="intent.leave"
        @close="intent.closeNow"
      />
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
