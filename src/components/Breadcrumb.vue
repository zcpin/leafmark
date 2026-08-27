<script setup lang="ts">
// 当前文件夹路径指示（A6）：仅指示 + 快速跳转，不再承担「进入/返回」
import { computed } from 'vue'

import { useBookmarksStore } from '@/stores/bookmarks'

import Icon from './Icon.vue'

const bookmarks = useBookmarksStore()

// 根节点（id=0）无标题，不参与展示
const segments = computed(() => bookmarks.breadcrumb.filter((node) => node.id !== '0'))
</script>

<template>
  <nav v-if="segments.length" class="flex min-w-0 items-center gap-1 text-sm" aria-label="breadcrumb">
    <template v-for="(node, index) in segments" :key="node.id">
      <Icon v-if="index > 0" name="chevronRight" class="size-3 shrink-0 text-slate-400" />
      <button
        type="button"
        class="max-w-48 truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
        :class="
          index === segments.length - 1
            ? 'font-semibold text-slate-800 dark:text-slate-100'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        "
        :title="node.title"
        @click="bookmarks.setViewFolder(node.id)"
      >
        {{ node.title }}
      </button>
    </template>
  </nav>
</template>
