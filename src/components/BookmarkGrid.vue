<script setup lang="ts">
// 当前文件夹内容的卡片网格（A3）
import { computed } from 'vue'

import { t } from '@/lib/i18n'
import { useBookmarksStore } from '@/stores/bookmarks'

import BookmarkCard from './BookmarkCard.vue'

const bookmarks = useBookmarksStore()
const children = computed(() => bookmarks.currentChildren)
</script>

<template>
  <div v-if="children.length === 0" class="flex h-full flex-col items-center justify-center gap-2 py-20 text-center">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-12 text-slate-300 dark:text-slate-600">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
    <p class="text-sm font-medium text-slate-500 dark:text-slate-400">{{ t('emptyFolder') }}</p>
    <p class="text-xs text-slate-400 dark:text-slate-500">{{ t('emptyFolderHint') }}</p>
  </div>

  <div
    v-else
    class="grid gap-4"
    :style="{
      gridTemplateColumns: `repeat(auto-fill, minmax(var(--lm-card-width, 200px), 1fr))`,
    }"
  >
    <BookmarkCard v-for="node in children" :key="node.id" :node="node" />
  </div>
</template>
