<script setup lang="ts">
// 侧边栏书签树（A5）：点击切换主视图
import { computed } from 'vue'

import { t } from '@/lib/i18n'
import { flatten } from '@/lib/tree-utils'
import { useBookmarksStore } from '@/stores/bookmarks'

import Icon from './Icon.vue'

const bookmarks = useBookmarksStore()

const rows = computed(() => flatten(bookmarks.tree))

function titleOf(title: string, id: string): string {
  if (id === '0' || title === '') return t('appName')
  return title
}
</script>

<template>
  <nav class="flex flex-col gap-0.5 p-2">
    <button
      v-for="{ node, depth } in rows"
      :key="node.id"
      type="button"
      class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
      :class="
        bookmarks.currentFolder?.id === node.id
          ? 'bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300'
          : 'text-slate-600 dark:text-slate-300'
      "
      :style="{ marginLeft: `${depth * 14}px` }"
      :title="node.title"
      @click="bookmarks.setViewFolder(node.id)"
    >
      <Icon name="folder" class="size-4 shrink-0 text-amber-500/80 dark:text-amber-400/80" />
      <span class="truncate">{{ titleOf(node.title, node.id) }}</span>
    </button>
  </nav>
</template>
