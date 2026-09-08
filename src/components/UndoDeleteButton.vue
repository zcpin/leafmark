<script setup lang="ts">
import { onMounted } from 'vue'
import { t } from '@/lib/i18n'
import { useDeletionsStore } from '@/stores/deletions'

const deletions = useDeletionsStore()
onMounted(() => { void deletions.init() })
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <button v-if="deletions.undoCount" type="button" :disabled="disabled || deletions.busy" class="shrink-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300" @click="deletions.undo()">
    {{ t(deletions.busy ? 'undoWorking' : 'undoDelete', { n: deletions.undoCount }) }}
  </button>
</template>
