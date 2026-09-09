<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDialogFocus } from '@/composables/useDialogFocus'

import { t, type MessageKey } from '@/lib/i18n'
import { checkableUrl, isUnreachable, normalizeLinkTimeout, type CheckedLink, type LinkStatus } from '@/lib/link-checker'
import { openUrl } from '@/lib/tabs'
import { checkFolderOptions, normalizeIgnoredDomain } from '@/lib/link-check-options'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useLinkCheckerStore } from '@/stores/link-checker'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

import Icon from './Icon.vue'
import UndoDeleteButton from './UndoDeleteButton.vue'

const checker = useLinkCheckerStore()
const settings = useSettingsStore()
const ui = useUiStore()
const bookmarks = useBookmarksStore()
const { setPanel } = useDialogFocus(() => checker.open, () => checker.hide())
const timeout = ref(settings.linkCheckTimeout)
const scopeId = ref(settings.linkCheckOptions.folderId ?? '')
const ignoredText = ref(settings.linkCheckOptions.ignoredDomains.join('\n'))
const savedIgnoredText = computed(() => settings.linkCheckOptions.ignoredDomains.join('\n'))
const ignoreDirty = computed(() => ignoredText.value !== savedIgnoredText.value)
const savingOptions = ref(false)
const optionsError = ref('')
const folders = computed(() => checkFolderOptions(bookmarks.tree))
const filter = ref<'failed' | 'restricted' | 'all'>('failed')

watch(() => settings.linkCheckTimeout, (value) => { timeout.value = value })
watch(() => settings.linkCheckOptions.folderId, (value) => { scopeId.value = value ?? '' })
watch(savedIgnoredText, (value, old) => { if (ignoredText.value === old) ignoredText.value = value })
onBeforeUnmount(() => checker.stop())

const visibleResults = computed(() => filter.value === 'failed' ? checker.failed
  : filter.value === 'restricted' ? checker.restricted : checker.results)
const eligible = computed(() => visibleResults.value.filter((row) =>
  checker.isCurrent(row) && (isUnreachable(row.status) || row.status === 'restricted')))
const allSelected = computed(() => eligible.value.length > 0 &&
  eligible.value.every((row) => checker.selectedIds.includes(row.id)))
const progress = computed(() => checker.total ? Math.round(checker.completed / checker.total * 100) : 0)
const tabs = computed(() => [
  { key: 'failed' as const, label: t('linkCheckUnreachable'), count: checker.failed.length },
  { key: 'restricted' as const, label: t('linkCheckNeedsReview'), count: checker.restricted.length },
  { key: 'all' as const, label: t('linkCheckAll'), count: checker.results.length },
])
const statusKeys: Record<LinkStatus, MessageKey> = {
  ok: 'linkCheckOk',
  'http-error': 'linkCheckHttpError',
  timeout: 'linkCheckTimeoutStatus',
  'network-error': 'linkCheckNetworkError',
  restricted: 'linkCheckRestricted',
  unsupported: 'linkCheckUnsupported',
  cancelled: 'linkCheckStopped',
}

function canSelect(row: CheckedLink) {
  return checker.isCurrent(row) && (isUnreachable(row.status) || row.status === 'restricted')
}
function toggleVisible(event: Event) {
  checker.selectedIds = (event.target as HTMLInputElement).checked ? eligible.value.map((row) => row.id) : []
}
async function saveTimeout() {
  timeout.value = normalizeLinkTimeout(timeout.value)
  try {
    await settings.setLinkCheckTimeout(timeout.value)
  } catch {
    timeout.value = settings.linkCheckTimeout
    ui.toast(t('linkCheckTimeoutSaveFailed'))
  }
}

async function saveScope() {
  savingOptions.value = true
  optionsError.value = ''
  try { await settings.setLinkCheckOptions({ folderId: scopeId.value || null }) }
  catch { scopeId.value = settings.linkCheckOptions.folderId ?? ''; optionsError.value = t('linkCheckOptionsFailed') }
  finally { savingOptions.value = false }
}

async function saveIgnoredDomains() {
  const domains = ignoredText.value.split(/[\n,，]+/).map((value) => value.trim()).filter(Boolean)
  if (domains.some((domain) => !normalizeIgnoredDomain(domain))) { optionsError.value = t('linkCheckDomainInvalid'); return }
  savingOptions.value = true
  optionsError.value = ''
  try {
    await settings.setLinkCheckOptions({ ignoredDomains: domains })
    ignoredText.value = savedIgnoredText.value
  } catch { optionsError.value = t('linkCheckOptionsFailed') }
  finally { savingOptions.value = false }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="checker.open" class="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/35 p-4" @click.self="checker.hide()">
      <section
        :ref="setPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-check-title"
        tabindex="-1"
        class="glass-strong flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl text-slate-700 outline-none dark:text-slate-200"
      >
        <header class="flex shrink-0 items-start justify-between gap-4 border-b border-slate-400/15 p-5">
          <div>
            <h2 id="link-check-title" class="text-lg font-semibold">{{ t('linkCheckTitle') }}</h2>
            <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{{ t('linkCheckDescription') }}</p>
          </div>
          <button type="button" :aria-label="t('close')" :disabled="checker.deleting" class="rounded-lg p-2 hover:bg-slate-500/10 disabled:opacity-40" @click="checker.hide()">
            <Icon name="x" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="space-y-3 p-5">
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex min-w-0 flex-col gap-1.5 text-xs">
              <span>{{ t('linkCheckScope') }}</span>
              <select v-model="scopeId" :disabled="!settings.ready || checker.busy || checker.deleting || savingOptions" class="max-w-64 rounded-lg border border-slate-400/25 bg-white/50 px-3 py-2 text-sm dark:bg-slate-900/50" @change="saveScope">
                <option value="">{{ t('linkCheckScopeAll') }}</option>
                <option v-if="scopeId && !checker.scopeValid" :value="scopeId">{{ t('linkCheckScopeMissing') }}</option>
                <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.label }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-xs">
              <span>{{ t('linkCheckTimeoutLabel') }}</span>
              <input v-model.number="timeout" type="number" min="3" max="60" step="1" :disabled="!settings.ready || checker.busy || checker.deleting" class="w-24 rounded-lg border border-slate-400/25 bg-white/50 px-3 py-2 text-sm tabular-nums dark:bg-slate-900/50" @change="saveTimeout" />
            </label>
            <button v-if="!checker.busy" type="button" :disabled="!settings.ready || checker.deleting || checker.targets.length === 0 || savingOptions || ignoreDirty" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40" @click="checker.start(undefined, timeout)">
              {{ t('linkCheckStart') }}
            </button>
            <button v-else type="button" class="rounded-lg bg-slate-500/10 px-4 py-2 text-sm hover:bg-slate-500/20" @click="checker.stop()">
              {{ t('linkCheckStop') }}
            </button>
            <button type="button" :disabled="!settings.ready || checker.busy || checker.deleting || checker.failed.length === 0 || savingOptions || ignoreDirty" class="rounded-lg px-3 py-2 text-xs hover:bg-slate-500/10 disabled:opacity-40" @click="checker.start(checker.failed, timeout)">
              {{ t('linkCheckRetry') }}
            </button>
            <span class="ml-auto text-xs text-slate-500 dark:text-slate-400">{{ t('linkCheckCount', { n: checker.targets.length }) }}</span>
          </div>
          <details class="rounded-lg border border-slate-400/20 px-3 py-2 text-xs">
            <summary class="cursor-pointer">{{ t('linkCheckIgnored', { n: settings.linkCheckOptions.ignoredDomains.length, skipped: checker.ignoredCount }) }}</summary>
            <label class="mt-3 block">
              <span class="mb-2 block text-slate-500 dark:text-slate-400">{{ t('linkCheckIgnoreHint') }}</span>
              <textarea v-model="ignoredText" :aria-label="t('linkCheckIgnoreLabel')" :disabled="!settings.ready || checker.busy || checker.deleting || savingOptions" rows="3" maxlength="8000" placeholder="example.com" class="w-full rounded-lg border border-slate-400/20 bg-white/50 p-2 dark:bg-slate-900/50" />
            </label>
            <button type="button" :disabled="!settings.ready || checker.busy || checker.deleting || savingOptions || !ignoreDirty" class="mt-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-700 disabled:opacity-40 dark:text-emerald-300" @click="saveIgnoredDomains">{{ t('linkCheckSaveIgnored') }}</button>
          </details>
          <p v-if="ignoreDirty" class="text-xs text-amber-700 dark:text-amber-300">{{ t('linkCheckIgnoreUnsaved') }}</p>
          <p v-if="optionsError || (!checker.scopeValid && bookmarks.tree.length)" role="alert" class="text-xs text-red-700 dark:text-red-300">{{ optionsError || t('linkCheckScopeMissing') }}</p>
          <p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{{ t('linkCheckPermissionHint') }}</p>
          <p v-if="checker.error" role="alert" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{{ checker.error }}</p>
          <div v-if="checker.phase !== 'idle'" class="space-y-2">
            <div class="flex justify-between gap-3 text-xs" aria-live="polite">
              <span>{{ checker.phase === 'permission' ? t('linkCheckAuthorizing') : checker.phase === 'stopped' ? t('linkCheckStopped') : checker.phase === 'done' ? t('linkCheckDone') : t('linkCheckRunning') }}</span>
              <span class="tabular-nums">{{ checker.completed }} / {{ checker.total }}</span>
            </div>
            <div role="progressbar" :aria-label="t('linkCheckRunning')" :aria-valuenow="progress" :aria-valuemin="0" :aria-valuemax="100" class="h-1.5 overflow-hidden rounded-full bg-slate-400/20">
              <div class="h-full bg-emerald-500" :style="{ width: `${progress}%` }" />
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1 border-y border-slate-400/15 px-5 py-2">
          <button v-for="item in tabs" :key="item.key" type="button" :aria-pressed="filter === item.key" class="rounded-lg px-3 py-1.5 text-xs" :class="filter === item.key ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'hover:bg-slate-500/10'" @click="filter = item.key">
            {{ item.label }} <span class="ml-1 tabular-nums">{{ item.count }}</span>
          </button>
        </div>

        <div>
          <p v-if="visibleResults.length === 0" class="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {{ checker.phase === 'idle' && checker.results.length === 0 ? t('linkCheckReady') : t('linkCheckEmpty') }}
          </p>
          <ul v-else class="divide-y divide-slate-400/15">
            <li v-for="row in visibleResults" :key="row.id" class="flex flex-wrap items-start gap-3 px-5 py-3">
              <input v-model="checker.selectedIds" type="checkbox" :value="row.id" :aria-label="t('linkCheckSelect', { title: row.title || row.url })" :disabled="checker.busy || checker.deleting || !canSelect(row)" class="mt-1 size-4 shrink-0 accent-emerald-500 disabled:opacity-30" />
              <div class="min-w-0 flex-1 basis-48">
                <p class="truncate text-sm font-medium" :title="row.title">{{ row.title || row.url }}</p>
                <p class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" :title="row.url">{{ row.url }}</p>
                <p class="mt-1 truncate text-xs text-slate-400 dark:text-slate-500" :title="row.folder">{{ row.folder }}</p>
                <p v-if="!checker.isCurrent(row)" class="mt-1 text-xs text-amber-600 dark:text-amber-300">{{ t('linkCheckStale') }}</p>
              </div>
              <div class="flex items-center gap-3">
                <span class="rounded-md px-2 py-1 text-xs" :class="isUnreachable(row.status) ? 'bg-red-500/10 text-red-700 dark:text-red-300' : row.status === 'restricted' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : row.status === 'ok' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/10 text-slate-500'">
                  {{ t(statusKeys[row.status]) }}{{ row.httpStatus ? ` · ${row.httpStatus}` : '' }}
                </span>
                <button type="button" :disabled="!checkableUrl(row.url)" class="rounded-lg p-2 text-xs hover:bg-slate-500/10 disabled:opacity-30" @click="openUrl(row.url, true)">{{ t('linkCheckOpen') }}</button>
              </div>
            </li>
          </ul>
        </div>

        </div>
        <footer class="shrink-0 space-y-3 border-t border-slate-400/15 p-5">
          <p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{{ t('linkCheckReviewHint') }}</p>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <UndoDeleteButton :disabled="checker.busy || checker.deleting" />
            <label class="flex items-center gap-2 text-xs">
              <input type="checkbox" :checked="allSelected" :disabled="checker.busy || checker.deleting || eligible.length === 0" class="size-4 accent-emerald-500" @change="toggleVisible" />
              {{ t('linkCheckSelectVisible') }}
            </label>
            <button type="button" :disabled="checker.busy || checker.deleting || checker.selectedCount === 0" class="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-40" @click="checker.deleteSelected()">
              {{ t(checker.deleting ? 'linkCheckDeleting' : 'linkCheckDeleteSelected', { n: checker.selectedCount }) }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
