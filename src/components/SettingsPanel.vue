<script setup lang="ts">
// 设置面板（F2/F3/F5/F6）：外观（背景/主题）+ 布局（卡片宽高/容器宽）+ 通用（打开方式）
// 从右侧滑入的毛玻璃抽屉
import { computed, ref } from 'vue'

import Icon from '@/components/Icon.vue'
import {
  compressWallpaper,
  readFileAsDataUrl,
  validateImageFile,
} from '@/lib/wallpaper'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useLinkCheckerStore } from '@/stores/link-checker'
import { useDuplicatesStore } from '@/stores/duplicates'
import { useSettingsStore, type DisplaySettings } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const settings = useSettingsStore()
const bookmarks = useBookmarksStore()
const ui = useUiStore()
const linkChecker = useLinkCheckerStore()
const duplicates = useDuplicatesStore()
const displayOptions = [
  { key: 'clock', label: 'displayClock' },
  { key: 'yearProgress', label: 'displayYearProgress' },
  { key: 'stats', label: 'displayStats' },
] as const

async function onDisplayChange(key: keyof DisplaySettings, event: Event) {
  const input = event.target as HTMLInputElement
  try { await settings.setDisplay({ [key]: input.checked }) }
  catch { input.checked = settings.display[key]; ui.toast(t('appearanceSaveFailed')) }
}

const homeFolderName = computed(() => {
  if (bookmarks.homeFolder) return bookmarks.homeFolder.title
  if (bookmarks.error) return t('loadError')
  if (bookmarks.tree.length === 0) return t('loading')
  return t('homeFolderUnavailable')
})
const homeFolderHint = computed(() => {
  if (settings.homeFolderId === null) return t('defaultHomeHint')
  if (bookmarks.tree.length > 0 && !bookmarks.homeFolder) return t('homeFolderUnavailableHint')
  return t('customHomeHint')
})
const resettingHome = ref(false)

async function resetHomeFolder() {
  if (resettingHome.value) return
  resettingHome.value = true
  try {
    await bookmarks.resetHomeFolder()
    ui.toast(t('homeReset'))
  } catch {
    ui.toast(t('homeSaveFailed'))
  } finally {
    resettingHome.value = false
  }
}

const open = ref(false)
const tab = ref<'appearance' | 'layout' | 'general'>('appearance')

function show() {
  open.value = true
}
function hide() {
  reportSave(settings.flushAppearance())
  open.value = false
}

function showLinkChecker() {
  hide()
  linkChecker.show()
}

function showDuplicates() {
  hide()
  duplicates.show()
}

defineExpose({ show, hide })

// —— 背景：预设壁纸 / 纯色渐变 / 上传 ——
// 预设壁纸用打包资源（Vite import 解析为 URL），避免运行时远程加载
import wp1 from '@/assets/wallpapers/wallpaper-1.svg'
import wp2 from '@/assets/wallpapers/wallpaper-2.svg'
import wp3 from '@/assets/wallpapers/wallpaper-3.svg'
const presets = [
  { id: 'preset-1', url: wp1, title: 'Foggy Forest' },
  { id: 'preset-2', url: wp2, title: 'Aurora' },
  { id: 'preset-3', url: wp3, title: 'Ocean' },
]
import { COLOR_THEMES, themeGradient } from '@/lib/backgrounds'

const fileInput = ref<HTMLInputElement>()
let uploading = false

async function onFileChange(e: Event) {
  if (uploading) return
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (!file) return
  const err = validateImageFile(file)
  if (err) {
    ui.toast(err === 'tooLarge' ? t('imageTooLarge') : t('notImage'))
    return
  }
  uploading = true
  try {
    const raw = await readFileAsDataUrl(file)
    const { dataUrl } = await compressWallpaper(raw)
    await settings.setUserWallpaper(dataUrl)
    ui.toast(t('wallpaperUploadSuccess'))
  } catch {
    ui.toast(t('wallpaperUploadError'))
  } finally {
    uploading = false
  }
}

// —— 布局滑块 ——
let lastSaveError: unknown
function reportSave(pending: Promise<void>) {
  void pending.catch((error: unknown) => {
    if (lastSaveError === error) return
    lastSaveError = error
    ui.toast(t('appearanceSaveFailed'))
  })
}

const cardWidth = computed({
  get: () => settings.layout.cardWidth,
  set: (v: number) => reportSave(settings.setLayout({ cardWidth: v })),
})
const cardHeight = computed({
  get: () => settings.layout.cardHeight,
  set: (v: number) => reportSave(settings.setLayout({ cardHeight: v })),
})
const containerWidth = computed({
  get: () => settings.layout.containerWidth,
  set: (v: number) => reportSave(settings.setLayout({ containerWidth: v })),
})

function onBooleanChange(key: 'openInNewTab' | 'reduceEffects', event: Event) {
  const input = event.target as HTMLInputElement
  const pending = key === 'openInNewTab' ? settings.setOpenInNewTab(input.checked) : settings.setReduceEffects(input.checked)
  void pending.catch(() => { input.checked = settings[key] })
  reportSave(pending)
}

function onTransparencyInput(event: Event) {
  reportSave(settings.setGlassTransparency(Number((event.target as HTMLInputElement).value)))
}

const themeLabel = computed(() =>
  settings.theme === 'dark' ? t('themeDark') : settings.theme === 'light' ? t('themeLight') : t('themeAuto'),
)
</script>

<template>
  <!-- 触发按钮由父级提供，这里只负责面板 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-x-full"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="glass-strong fixed right-3 top-3 bottom-3 z-[80] flex w-80 flex-col overflow-hidden rounded-2xl"
      >
        <header class="flex items-center justify-between border-b border-white/40 px-4 py-3 dark:border-white/10">
          <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">{{ t('settings') }}</h2>
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
            :aria-label="t('close')"
            @click="hide"
          >
            <Icon name="x" />
          </button>
        </header>

        <div class="flex gap-1 border-b border-white/40 px-3 py-2 dark:border-white/10">
          <button
            v-for="key in (['appearance', 'layout', 'general'] as const)"
            :key="key"
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              tab === key
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'text-slate-500 hover:bg-slate-500/10 dark:text-slate-400'
            "
            @click="tab = key"
          >
            {{ t(key) }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <!-- 外观 -->
          <div v-show="tab === 'appearance'" class="space-y-6">
            <section>
              <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ t('themeLight') }}</h3>
              <button
                type="button"
                class="glass flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                @click="reportSave(settings.cycleTheme())"
              >
                <span class="text-slate-700 dark:text-slate-200">{{ themeLabel }}</span>
                <Icon :name="settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'monitor'" />
              </button>
            </section>

            <label class="block">
              <div class="mb-2 flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                <span>{{ t('glassTransparency') }}</span>
                <span class="text-xs tabular-nums">{{ settings.glassTransparency }}%</span>
              </div>
              <input
                :value="settings.glassTransparency"
                :aria-label="t('glassTransparency')"
                type="range"
                min="0"
                max="60"
                step="5"
                class="w-full accent-emerald-500"
                @input="onTransparencyInput"
                @change="reportSave(settings.flushAppearance())"
              />
              <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {{ t('glassTransparencyHint') }}
              </p>
            </label>

            <section>
              <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ t('background') }}</h3>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="p in presets"
                  :key="p.id"
                  type="button"
                  class="h-16 overflow-hidden rounded-lg ring-2 ring-transparent transition-all hover:ring-emerald-400/60"
                  :class="{ 'ring-emerald-500': settings.bgKind === 'wallpaper' && settings.wallpaperId === p.id }"
                  :title="p.title"
                  @click="reportSave(settings.setPresetWallpaper(p.id, p.url))"
                >
                  <img :src="p.url" :alt="p.title" class="size-full object-cover" />
                </button>
              </div>
              <button
                type="button"
                class="glass mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-500/10 dark:text-slate-300"
                @click="fileInput?.click()"
              >
                <Icon name="externalLink" />
                {{ t('uploadWallpaper') }}
              </button>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

              <h4 class="mt-5 text-xs font-semibold text-slate-600 dark:text-slate-300">{{ t('colorThemes') }}</h4>
              <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{{ t('colorThemesHint') }}</p>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button
                  v-for="theme in COLOR_THEMES"
                  :key="theme.id"
                  type="button"
                  class="overflow-hidden rounded-lg border border-slate-400/20 text-left ring-2 ring-transparent transition-colors hover:ring-emerald-400/60 focus-visible:outline-2 focus-visible:outline-emerald-600"
                  :class="[theme.id, { 'ring-emerald-600 dark:ring-emerald-400': settings.bgKind === 'solid' && settings.solidBg === theme.id }]"
                  :title="t(theme.label)"
                  :aria-label="t(theme.label)"
                  :aria-pressed="settings.bgKind === 'solid' && settings.solidBg === theme.id"
                  @click="reportSave(settings.setSolidBg(theme.id))"
                >
                  <span class="flex h-11 items-center justify-end p-2" :style="{ backgroundImage: themeGradient(theme.id, settings.resolvedTheme) }">
                    <span v-if="settings.bgKind === 'solid' && settings.solidBg === theme.id" class="rounded-full bg-emerald-700 p-0.5 text-white dark:bg-emerald-400 dark:text-slate-950"><Icon name="check" class="size-3" /></span>
                  </span>
                  <span class="block px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200">{{ t(theme.label) }}</span>
                </button>
              </div>
            </section>
            <section class="space-y-2">
              <h3 class="text-xs font-semibold text-slate-400">{{ t('displaySettings') }}</h3>
              <label v-for="item in displayOptions" :key="item.key" class="glass flex items-center justify-between gap-3 rounded-xl px-4 py-3">
                <span class="text-sm text-slate-700 dark:text-slate-200">{{ t(item.label) }}</span>
                <input type="checkbox" :checked="settings.display[item.key]" class="size-4 shrink-0 accent-emerald-500" @change="onDisplayChange(item.key, $event)" />
              </label>
            </section>
          </div>

          <!-- 布局 -->
          <div v-show="tab === 'layout'" class="space-y-5">
            <label class="block">
              <div class="mb-1 flex justify-between text-xs text-slate-500">
                <span>{{ t('cardWidth') }}</span><span class="tabular-nums">{{ cardWidth }}px</span>
              </div>
              <input v-model.number="cardWidth" type="range" min="140" max="280" step="10" class="w-full accent-emerald-500" @change="reportSave(settings.flushAppearance())" />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between text-xs text-slate-500">
                <span>{{ t('cardHeight') }}</span><span class="tabular-nums">{{ cardHeight }}px</span>
              </div>
              <input v-model.number="cardHeight" type="range" min="40" max="80" step="2" class="w-full accent-emerald-500" @change="reportSave(settings.flushAppearance())" />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between text-xs text-slate-500">
                <span>{{ t('containerWidth') }}</span><span class="tabular-nums">{{ containerWidth }}%</span>
              </div>
              <input v-model.number="containerWidth" type="range" min="60" max="100" step="5" class="w-full accent-emerald-500" @change="reportSave(settings.flushAppearance())" />
            </label>
          </div>

          <!-- 通用 -->
          <div v-show="tab === 'general'" class="space-y-4">
            <section class="glass rounded-xl px-4 py-3">
              <h3 class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('duplicateTitle') }}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{{ t('duplicateHint') }}</p>
              <button type="button" class="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300" @click="showDuplicates">{{ t('duplicateOpen') }}</button>
            </section>
            <section class="glass rounded-xl px-4 py-3">
              <h3 class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('linkCheckTitle') }}</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{{ t('linkCheckEntryHint') }}</p>
              <button type="button" class="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300" @click="showLinkChecker">
                {{ t('linkCheckOpenTool') }}
              </button>
            </section>
            <section class="glass rounded-xl px-4 py-3">
              <h3 class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('homeFolder') }}</h3>
              <div class="mt-2 flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <Icon name="folder" class="shrink-0 text-amber-500 dark:text-amber-400" />
                <span class="truncate" :title="homeFolderName">{{ homeFolderName }}</span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {{ homeFolderHint }}
              </p>
              <button
                type="button"
                class="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/25 disabled:cursor-default disabled:opacity-40 dark:text-emerald-300"
                :disabled="settings.homeFolderId === null || resettingHome"
                @click="resetHomeFolder"
              >
                {{ resettingHome ? t('homeSaving') : t('resetHome') }}
              </button>
            </section>
            <label class="glass flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-200">{{ t('settingsOpenInNewTab') }}</span>
              <input :checked="settings.openInNewTab" type="checkbox" class="size-4 accent-emerald-500" @change="onBooleanChange('openInNewTab', $event)" />
            </label>
            <label class="glass flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-200">{{ t('settingsReduceEffects') }}</span>
              <input :checked="settings.reduceEffects" type="checkbox" class="size-4 accent-emerald-500" @change="onBooleanChange('reduceEffects', $event)" />
            </label>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
