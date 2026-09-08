import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { findDuplicateLinks, retainsDuplicateCopy, type DuplicateGroup } from '@/lib/duplicate-links'
import type { LinkTarget } from '@/lib/link-checker'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from './bookmarks'
import { useDeletionsStore } from './deletions'
import { useUiStore } from './ui'

export const useDuplicatesStore = defineStore('duplicates', () => {
  const bookmarks = useBookmarksStore()
  const deletions = useDeletionsStore()
  const ui = useUiStore()
  const open = ref(false)
  const busy = ref(false)
  const error = ref('')
  const chosen = shallowRef<LinkTarget[]>([])
  const groups = computed(() => findDuplicateLinks(bookmarks.tree))
  const extraCount = computed(() => groups.value.reduce((sum, group) => sum + group.links.length - 1, 0))
  const current = computed(() => new Map(groups.value.flatMap((group) => group.links.map((link) => [link.id, link.url] as const))))
  const selected = computed(() => chosen.value.filter((link) => current.value.get(link.id) === link.url))
  const validSelection = computed(() => selected.value.length > 0 && retainsDuplicateCopy(bookmarks.tree, selected.value))

  function show() { open.value = true; error.value = ''; void bookmarks.load() }
  function hide() { if (!busy.value) open.value = false }
  function isSelected(link: LinkTarget) { return selected.value.some((item) => item.id === link.id && item.url === link.url) }
  function canSelect(link: LinkTarget, group: DuplicateGroup) {
    return isSelected(link) || group.links.filter(isSelected).length < group.links.length - 1
  }
  function toggle(link: LinkTarget, checked: boolean) {
    chosen.value = chosen.value.filter((item) => item.id !== link.id)
    if (checked) chosen.value = [...chosen.value, { ...link }]
  }
  async function deleteSelected() {
    if (busy.value || !validSelection.value) return
    const snapshot = [...selected.value]
    busy.value = true
    error.value = ''
    try {
      if (!await ui.confirm({ title: t('duplicateDeleteTitle'), message: t('duplicateDeleteConfirm', { n: snapshot.length }), danger: true })) return
      const result = await deletions.remove(snapshot, (tree) => retainsDuplicateCopy(tree, snapshot))
      chosen.value = chosen.value.filter((link) => !result.deleted.includes(link.id))
      ui.toast(t('deleteUndoResult', { n: result.deleted.length, remaining: result.failed + result.skipped }))
    } catch {
      error.value = t('duplicateChanged')
    } finally {
      busy.value = false
    }
  }
  return { open, busy, error, groups, extraCount, selected, validSelection, show, hide, isSelected, canSelect, toggle, deleteSelected }
})
