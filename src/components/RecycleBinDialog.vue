<script setup lang="ts">
// 回收站面板：逐条展示已删除的书签（标题/网址/来源目录/删除时间），
// 支持单独恢复、彻底删除，以及全部恢复与清空。
import { computed, ref } from 'vue'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { faviconUrl } from '@/lib/favicon'
import { t, uiLanguage } from '@/lib/i18n'
import { useDeletionsStore, type BinItem } from '@/stores/deletions'
import { useUiStore } from '@/stores/ui'
import Icon from './Icon.vue'

const deletions = useDeletionsStore()
const ui = useUiStore()
const { setPanel, titleId } = useDialogFocus(
  () => deletions.binOpen,
  () => deletions.hideBin(),
)

const count = computed(() => deletions.items.length)
const favFailed = ref(new Set<string>())

let formatter: Intl.DateTimeFormat | null = null
function formatTime(ms: number): string {
  if (!ms) return ''
  formatter ??= new Intl.DateTimeFormat(uiLanguage(), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return formatter.format(new Date(ms))
}

function onFavError(url: string) {
  favFailed.value = new Set(favFailed.value).add(url)
}

/** 开发预览下 faviconUrl 返回空串，回退到图标 */
function faviconOf(item: BinItem): string {
  return item.url ? faviconUrl(item.url) : ''
}

function itemLabel(item: BinItem) {
  return item.isFolder ? t('recycleBinFolderItems', { n: item.count }) : (item.url ?? item.title)
}

async function restoreAll() {
  await deletions.restore(deletions.items.map((item) => item.id))
}

async function discardItem(item: BinItem) {
  const confirmed = await ui.confirm({
    title: t('recycleBinDiscardTitle'),
    message: t('recycleBinDiscardMessage'),
    danger: true,
  })
  if (confirmed) await deletions.discard([item.id])
}

async function clearBin() {
  const confirmed = await ui.confirm({
    title: t('recycleBinClearTitle'),
    message: t('recycleBinClearMessage', { n: count.value }),
    danger: true,
  })
  if (confirmed) await deletions.clear()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="deletions.binOpen"
      class="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/35 p-4"
      @click.self="deletions.hideBin()"
    >
      <section
        :ref="setPanel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="glass-strong flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl text-slate-700 outline-none dark:text-slate-200"
      >
        <header class="flex items-start justify-between gap-4 border-b border-slate-400/15 p-5">
          <div>
            <h2 :id="titleId" class="text-lg font-semibold">{{ t('recycleBinTitle') }}</h2>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ t('recycleBinHint') }}
            </p>
          </div>
          <button
            type="button"
            :disabled="deletions.busy"
            :aria-label="t('close')"
            class="rounded-lg p-2 hover:bg-slate-500/10"
            @click="deletions.hideBin()"
          >
            <Icon name="x" />
          </button>
        </header>
        <div class="flex items-center justify-between gap-3 p-5 text-sm">
          <span>{{ t('recycleBinCount', { n: count }) }}</span>
          <span v-if="deletions.busy" class="text-xs text-slate-500">{{
            t('restoreWorking')
          }}</span>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <p v-if="!count" class="py-10 text-center text-sm text-slate-500">
            {{ t('recycleBinEmpty') }}
          </p>
          <ul v-else class="divide-y divide-slate-400/15 rounded-xl border border-slate-400/20">
            <li v-for="item in deletions.items" :key="item.id" class="flex items-start gap-3 p-4">
              <img
                v-if="faviconOf(item) && !favFailed.has(item.url!)"
                :src="faviconOf(item)"
                alt=""
                class="mt-0.5 size-5 shrink-0 rounded"
                @error="onFavError(item.url!)"
              />
              <Icon
                v-else
                :name="item.isFolder ? 'folder' : 'externalLink'"
                class="mt-0.5 size-5 text-slate-400"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium" :title="item.title">
                  {{ item.title || item.url }}
                </p>
                <p
                  class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400"
                  :title="itemLabel(item)"
                >
                  {{ itemLabel(item) }}
                </p>
                <p class="mt-1 truncate text-xs text-slate-400">
                  {{ t('recycleBinFrom', { folder: item.folder }) }} ·
                  {{ formatTime(item.deletedAt) }}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <button
                  type="button"
                  :disabled="deletions.busy"
                  :aria-label="t('recycleBinRestore')"
                  class="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
                  @click="deletions.restore([item.id])"
                >
                  {{ t('recycleBinRestore') }}
                </button>
                <button
                  type="button"
                  :disabled="deletions.busy"
                  :aria-label="t('recycleBinDiscard')"
                  class="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-500/10 disabled:opacity-40 dark:text-slate-400"
                  @click="discardItem(item)"
                >
                  {{ t('recycleBinDiscard') }}
                </button>
              </div>
            </li>
          </ul>
        </div>
        <footer
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-400/15 p-5"
        >
          <button
            type="button"
            :disabled="deletions.busy || !count"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
            @click="restoreAll"
          >
            {{ t('recycleBinRestoreAll') }}
          </button>
          <button
            type="button"
            :disabled="deletions.busy || !count"
            class="rounded-lg px-4 py-2 text-xs text-slate-500 hover:bg-slate-500/10 disabled:opacity-40 dark:text-slate-400"
            @click="clearBin"
          >
            {{ t('recycleBinClear') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
