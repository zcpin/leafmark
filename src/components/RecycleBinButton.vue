<script setup lang="ts">
// 回收站入口：顶栏/清理面板共用，显示待恢复条目数，点击打开回收站面板
import { computed, onMounted } from 'vue'
import { t } from '@/lib/i18n'
import { useDeletionsStore } from '@/stores/deletions'
import Icon from './Icon.vue'

const deletions = useDeletionsStore()
onMounted(() => {
  void deletions.init()
})
defineProps<{ disabled?: boolean }>()

const label = computed(() => t('recycleBin', { n: deletions.count }))
</script>

<template>
  <button
    v-if="deletions.count"
    type="button"
    :disabled="disabled || deletions.busy"
    :title="t('recycleBinHint')"
    :aria-label="label"
    class="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
    @click="deletions.showBin()"
  >
    <Icon name="trash" />
    <span>{{ label }}</span>
  </button>
</template>
