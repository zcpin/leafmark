<script setup lang="ts">
// 二维码对话框（B2）：本地生成 PNG + 复制 + 下载
import { onMounted, ref, watch } from 'vue'

import { downloadQr, generateQrDataUrl } from '@/lib/qrcode'
import { t } from '@/lib/i18n'
import { useUiStore } from '@/stores/ui'

import Icon from './Icon.vue'

const ui = useUiStore()

const dataUrl = ref('')
const loading = ref(false)
const copied = ref(false)

async function render() {
  if (!ui.qrVisible) return
  loading.value = true
  copied.value = false
  try {
    dataUrl.value = await generateQrDataUrl(ui.qrUrl, 240)
  } finally {
    loading.value = false
  }
}

watch(() => ui.qrVisible, () => void render())
onMounted(() => void render())

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(ui.qrUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    ui.toast(t('copyFailed'))
  }
}

function download() {
  if (dataUrl.value) downloadQr(dataUrl.value, ui.qrTitle)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ui.qrVisible"
      class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="ui.resolveQr()"
      @keydown.esc="ui.resolveQr()"
    >
      <div class="glass-strong w-full max-w-xs rounded-2xl p-6 text-center">
        <div class="relative mx-auto flex size-60 items-center justify-center">
          <div
            v-if="loading"
            class="text-sm text-slate-400"
          >
            {{ t('loading') }}
          </div>
          <img
            v-else
            :src="dataUrl"
            :alt="ui.qrTitle"
            class="size-60 rounded-xl bg-white p-2"
          />
        </div>

        <p class="mt-4 break-all text-xs text-slate-500 dark:text-slate-400">{{ ui.qrUrl }}</p>

        <div class="mt-5 flex justify-center gap-3">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-white/10"
            @click="copyUrl"
          >
            <Icon name="copy" />
            {{ copied ? t('copied') : t('copyUrl') }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            @click="download"
          >
            {{ t('download') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
