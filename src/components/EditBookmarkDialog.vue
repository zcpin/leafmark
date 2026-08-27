<script setup lang="ts">
// 编辑书签 / 重命名文件夹（B4），消费 ui store
import { computed, ref, watch } from 'vue'

import { t } from '@/lib/i18n'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const title = ref('')
const url = ref('')
const urlError = ref(false)

watch(
  () => ui.editVisible,
  (visible) => {
    if (visible && ui.editState) {
      title.value = ui.editState.title
      url.value = ui.editState.url ?? ''
      urlError.value = false
    }
  },
)

const isFolder = computed(() => ui.editState?.isFolder ?? false)

function submit() {
  if (!ui.editState) return
  // 书签必须填写 URL；文件夹无 URL
  if (!isFolder.value && url.value.trim() === '') {
    urlError.value = true
    return
  }
  ui.resolveEdit({
    title: title.value.trim(),
    url: isFolder.value ? undefined : url.value.trim(),
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ui.editVisible"
      class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="ui.resolveEdit(null)"
      @keydown.esc="ui.resolveEdit(null)"
    >
      <div class="glass-strong w-full max-w-sm rounded-2xl p-6">
        <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">
          {{ isFolder ? t('editFolderTitle') : t('editBookmarkTitle') }}
        </h2>

        <form class="mt-5 space-y-4" @submit.prevent="submit">
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              {{ t('nameLabel') }}
            </span>
            <input
              v-model="title"
              type="text"
              class="w-full rounded-lg border border-slate-300/60 bg-white/60 px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </label>

          <label v-if="!isFolder" class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              {{ t('urlLabel') }}
            </span>
            <input
              v-model="url"
              type="text"
              class="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2"
              :class="
                urlError
                  ? 'border-red-400 bg-red-500/5 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-slate-300/60 bg-white/60 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-white/5'
              "
              :style="!urlError ? undefined : ''"
            />
            <span v-if="urlError" class="mt-1 block text-xs text-red-500">{{ t('urlRequired') }}</span>
          </label>

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-white/10"
              @click="ui.resolveEdit(null)"
            >
              {{ t('cancel') }}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              {{ t('save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
