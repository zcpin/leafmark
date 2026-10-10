<script setup lang="ts">
// 搜索结果视图：复用 BookmarkGrid 的窗口化渲染，只替换数据源与卡片副标题
import { computed } from 'vue'

import { t } from '@/lib/i18n'
import { useSearchStore } from '@/stores/search'

import BookmarkGrid from './BookmarkGrid.vue'

const search = useSearchStore()
const nodes = computed(() => search.results.map((hit) => hit.node))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      v-if="search.total === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <p class="text-sm font-medium text-slate-500 dark:text-slate-400">
        {{ t('searchNoResults') }}
      </p>
      <p class="text-xs text-slate-400 dark:text-slate-500">{{ t('searchNoResultsHint') }}</p>
      <button
        type="button"
        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
        @click="search.clear()"
      >
        {{ t('searchClear') }}
      </button>
    </div>
    <template v-else>
      <p
        v-if="search.hiddenCount > 0"
        class="mb-2 shrink-0 text-center text-xs text-slate-500 dark:text-slate-400"
      >
        {{ t('searchTruncated', { n: search.hiddenCount }) }}
      </p>
      <BookmarkGrid :items="nodes" :paths="search.paths" results-mode />
    </template>
  </div>
</template>
