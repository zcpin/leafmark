<script setup lang="ts">
// 顶栏搜索框：展开时接管面包屑位置并自动聚焦
// 防抖与结果计算都在 search store 里，本组件只负责输入与两段式 Esc
import { computed, onMounted, ref } from 'vue'

import { t } from '@/lib/i18n'
import { useSearchStore } from '@/stores/search'

import Icon from './Icon.vue'

const emit = defineEmits<{ close: []; openFirst: [] }>()

const search = useSearchStore()
const inputEl = ref<HTMLInputElement>()

const hasInput = computed(() => search.input.length > 0)

function focus() {
  inputEl.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    // 两段式：先清空内容，已为空时才收起输入框
    if (hasInput.value) {
      search.clear()
      focus()
    } else {
      emit('close')
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    emit('openFirst')
  }
}

onMounted(focus)

defineExpose({ focus })
</script>

<template>
  <div
    class="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-slate-500/10 px-2 py-1 dark:bg-white/10"
  >
    <Icon name="search" class="text-slate-500 dark:text-slate-400" />
    <input
      ref="inputEl"
      type="text"
      class="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
      :value="search.input"
      :placeholder="t('searchPlaceholder')"
      :aria-label="t('search')"
      autocomplete="off"
      spellcheck="false"
      @input="search.setInput(($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <p
      v-if="search.showing"
      role="status"
      aria-live="polite"
      class="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400"
    >
      {{ t('searchResultsCount', { n: search.total }) }}
    </p>
    <button
      type="button"
      class="shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
      :aria-pressed="search.scope === 'folder'"
      :title="t('searchAllBookmarks')"
      @click="search.setScope(search.scope === 'folder' ? 'all' : 'folder')"
    >
      {{ search.scope === 'folder' ? t('searchInFolder') : t('searchAllBookmarks') }}
    </button>
    <button
      type="button"
      class="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-500/10 dark:text-slate-400 dark:hover:bg-white/10"
      :aria-label="hasInput ? t('searchClear') : t('searchClose')"
      :title="hasInput ? t('searchClear') : t('searchClose')"
      @click="hasInput ? (search.clear(), focus()) : emit('close')"
    >
      <Icon name="x" />
    </button>
  </div>
</template>
