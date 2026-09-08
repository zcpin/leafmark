import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'

import { t } from '@/lib/i18n'
import { checkableUrl, collectLinkTargets, isUnreachable, normalizeLinkTimeout, scanLinks, type CheckedLink, type LinkTarget } from '@/lib/link-checker'
import { requestLinkCheckAccess, supportsLinkCheck } from '@/lib/link-check-permissions'
import { scopedCheckTargets } from '@/lib/link-check-options'
import { useBookmarksStore } from './bookmarks'
import { useSettingsStore } from './settings'
import { useUiStore } from './ui'
import { useDeletionsStore } from './deletions'

export const useLinkCheckerStore = defineStore('link-checker', () => {
  const bookmarks = useBookmarksStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  const deletions = useDeletionsStore()
  const open = ref(false)
  const phase = ref<'idle' | 'permission' | 'running' | 'done' | 'stopped'>('idle')
  const results = shallowRef<CheckedLink[]>([])
  const selectedIds = ref<string[]>([])
  const error = ref('')
  const completed = ref(0)
  const total = ref(0)
  const deleting = ref(false)
  const busy = computed(() => phase.value === 'permission' || phase.value === 'running')
  const scope = computed(() => scopedCheckTargets(bookmarks.tree, settings.linkCheckOptions))
  const scopeValid = computed(() => scope.value.valid)
  const ignoredCount = computed(() => scope.value.ignored)
  const targets = computed(() => scope.value.targets)
  const current = computed(() => new Map(collectLinkTargets(bookmarks.tree).map((target) => [target.id, target])))
  const failed = computed(() => results.value.filter((result) => isUnreachable(result.status)))
  const restricted = computed(() => results.value.filter((result) => result.status === 'restricted'))
  const selection = computed(() => results.value.filter((result) =>
    selectedIds.value.includes(result.id) && isCurrent(result) &&
    (isUnreachable(result.status) || result.status === 'restricted')))
  const selectedCount = computed(() => selection.value.length)
  let controller: AbortController | null = null
  let runId = 0

  watch(() => JSON.stringify(settings.linkCheckOptions), () => {
    stop()
    results.value = []
    selectedIds.value = []
    completed.value = 0
    total.value = 0
    error.value = ''
    phase.value = 'idle'
  })
  watch(scopeValid, (valid) => { if (!valid) stop() })

  function isCurrent(result: LinkTarget): boolean {
    return current.value.get(result.id)?.url === result.url
  }

  function show() { open.value = true }
  function stop() {
    runId++
    controller?.abort()
    controller = null
    if (busy.value) phase.value = 'stopped'
  }
  function hide() {
    if (deleting.value) return
    stop()
    open.value = false
  }

  async function start(retry?: LinkTarget[], timeoutSeconds = settings.linkCheckTimeout) {
    if (busy.value || deleting.value) return
    if (!settings.ready) { error.value = t('linkCheckOptionsLoading'); return }
    if (!scopeValid.value) { error.value = t('linkCheckScopeMissing'); return }
    const allowed = new Set(targets.value.map((target) => target.id))
    const snapshot = (retry ?? targets.value).filter((target) => allowed.has(target.id) && isCurrent(target))
    if (snapshot.length === 0) return
    error.value = ''
    if (!supportsLinkCheck()) {
      error.value = t('linkCheckExtensionOnly')
      return
    }
    const id = ++runId
    const timeout = normalizeLinkTimeout(timeoutSeconds)
    phase.value = 'permission'
    try {
      // request 在第一个 await 之前执行，保留开始按钮的用户手势。
      const granted = snapshot.some((target) => checkableUrl(target.url))
        ? await requestLinkCheckAccess()
        : true
      if (id !== runId) return
      if (!granted) {
        error.value = t('linkCheckPermissionDenied')
        phase.value = 'idle'
        return
      }
      const retryIds = new Set(snapshot.map((target) => target.id))
      results.value = retry ? results.value.filter((result) => !retryIds.has(result.id)) : []
      selectedIds.value = []
      completed.value = 0
      total.value = snapshot.length
      phase.value = 'running'
      controller = new AbortController()
      await scanLinks(snapshot, timeout, controller.signal, (batch) => {
        if (id !== runId) return
        results.value = [...results.value, ...batch]
        completed.value += batch.length
      })
      if (id === runId) phase.value = 'done'
    } catch {
      if (id === runId) {
        error.value = t('linkCheckFailed')
        phase.value = 'idle'
      }
    } finally {
      if (id === runId) controller = null
    }
  }

  async function deleteSelected() {
    if (busy.value || deleting.value) return
    const selected = selection.value
    if (selected.length === 0) return
    deleting.value = true
    try {
      const confirmed = await ui.confirm({
        title: t('linkCheckDeleteTitle'),
        message: t('linkCheckDeleteConfirm', { n: selected.length }),
        danger: true,
      })
      if (!confirmed) return
      const outcome = await deletions.remove(selected)
      const deleted = new Set(outcome.deleted)
      results.value = results.value.filter((result) => !deleted.has(result.id))
      selectedIds.value = selectedIds.value.filter((id) => !deleted.has(id))
      ui.toast(t('linkCheckDeleteResult', { n: deleted.size, remaining: selected.length - deleted.size }))
    } catch {
      ui.toast(t('deleteUndoFailed'))
    } finally {
      deleting.value = false
    }
  }

  return { open, phase, results, selectedIds, error, completed, total, deleting, busy, targets,
    failed, restricted, selectedCount, scopeValid, ignoredCount, isCurrent, show, hide, stop, start, deleteSelected }
})
