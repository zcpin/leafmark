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
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const settings = useSettingsStore()
const ui = useUiStore()

const open = ref(false)
const tab = ref<'appearance' | 'layout' | 'general'>('appearance')

function show() {
  open.value = true
}
function hide() {
  open.value = false
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
const solids = [
  { cls: 'gradient-emerald', label: 'Emerald' },
  { cls: 'gradient-sky', label: 'Sky' },
  { cls: 'gradient-sunset', label: 'Sunset' },
  { cls: 'gradient-slate', label: 'Slate' },
]

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
    ui.toast(t('wallpaperUploadError').replace('失败，请重试', '已设置'))
  } catch {
    ui.toast(t('wallpaperUploadError'))
  } finally {
    uploading = false
  }
}

// —— 布局滑块 ——
const cardWidth = computed({
  get: () => settings.layout.cardWidth,
  set: (v: number) => void settings.setLayout({ cardWidth: v }),
})
const cardHeight = computed({
  get: () => settings.layout.cardHeight,
  set: (v: number) => void settings.setLayout({ cardHeight: v }),
})
const containerWidth = computed({
  get: () => settings.layout.containerWidth,
  set: (v: number) => void settings.setLayout({ containerWidth: v }),
})

const openInNewTab = computed({
  get: () => settings.openInNewTab,
  set: (v: boolean) => void settings.setOpenInNewTab(v),
})

const reduceEffects = computed({
  get: () => settings.reduceEffects,
  set: (v: boolean) => void settings.setReduceEffects(v),
})

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
                @click="settings.cycleTheme()"
              >
                <span class="text-slate-700 dark:text-slate-200">{{ themeLabel }}</span>
                <Icon :name="settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'monitor'" />
              </button>
            </section>

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
                  @click="settings.setPresetWallpaper(p.id, p.url)"
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

              <div class="mt-3 grid grid-cols-4 gap-2">
                <button
                  v-for="s in solids"
                  :key="s.cls"
                  type="button"
                  class="h-12 rounded-lg ring-2 ring-transparent transition-all hover:ring-emerald-400/60"
                  :class="[s.cls, { 'ring-emerald-500': settings.bgKind === 'solid' && settings.solidBg === s.cls }]"
                  :title="s.label"
                  @click="settings.setSolidBg(s.cls)"
                />
              </div>
            </section>
          </div>

          <!-- 布局 -->
          <div v-show="tab === 'layout'" class="space-y-5">
            <label class="block">
              <div class="mb-1 flex justify-between text-xs text-slate-500">
                <span>{{ t('cardWidth') }}</span><span class="tabular-nums">{{ cardWidth }}px</span>
              </div>
              <input v-model.number="cardWidth" type="range" min="140" max="280" step="10" class="w-full accent-emerald-500" />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between text-xs text-slate-500">
                <span>{{ t('cardHeight') }}</span><span class="tabular-nums">{{ cardHeight }}px</span>
              </div>
              <input v-model.number="cardHeight" type="range" min="40" max="80" step="2" class="w-full accent-emerald-500" />
            </label>
            <label class="block">
              <div class="mb-1 flex justify-between text-xs text-slate-500">
                <span>{{ t('containerWidth') }}</span><span class="tabular-nums">{{ containerWidth }}%</span>
              </div>
              <input v-model.number="containerWidth" type="range" min="60" max="100" step="5" class="w-full accent-emerald-500" />
            </label>
          </div>

          <!-- 通用 -->
          <div v-show="tab === 'general'" class="space-y-4">
            <label class="glass flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-200">{{ t('settingsOpenInNewTab') }}</span>
              <input v-model="openInNewTab" type="checkbox" class="size-4 accent-emerald-500" />
            </label>
            <label class="glass flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-200">{{ t('settingsReduceEffects') }}</span>
              <input v-model="reduceEffects" type="checkbox" class="size-4 accent-emerald-500" />
            </label>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
