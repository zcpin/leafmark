<script setup lang="ts">
// 新标签页：紧凑时钟、随内容收拢的书签浮岛、底部年度进度
// 全屏背景（壁纸/渐变）；书签超量时仅网格内部滚动
// 顶部工具行：面包屑（当前文件夹路径）/ 主题 / 设置
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import BookmarkGrid from '@/components/BookmarkGrid.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'
import Clock from '@/components/Clock.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EditBookmarkDialog from '@/components/EditBookmarkDialog.vue'
import DuplicateDialog from '@/components/DuplicateDialog.vue'
import Icon, { type IconName } from '@/components/Icon.vue'
import LinkCheckDialog from '@/components/LinkCheckDialog.vue'
import OnboardingOverlay from '@/components/OnboardingOverlay.vue'
import QrCodeDialog from '@/components/QrCodeDialog.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import ToastStack from '@/components/ToastStack.vue'
import UndoDeleteButton from '@/components/UndoDeleteButton.vue'
import { useDeletionsStore } from '@/stores/deletions'
import YearProgress from '@/components/YearProgress.vue'
import { useNow } from '@/composables/useNow'
import { greetingKey } from '@/lib/greeting'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { useStatsStore } from '@/stores/stats'
import { useUiStore } from '@/stores/ui'

const settings = useSettingsStore()
const bookmarks = useBookmarksStore()
const stats = useStatsStore()
const now = useNow()
const deletions = useDeletionsStore()
const ui = useUiStore()

function loadSettings() { void settings.init().catch(() => {}) }
async function cycleTheme() {
  try { await settings.cycleTheme() }
  catch { ui.toast(t('appearanceSaveFailed')) }
}

const settingsPanel = ref<{ show: () => void } | null>(null)

onMounted(() => {
  loadSettings()
  void bookmarks.init()
})

onBeforeUnmount(() => {
  settings.dispose()
  bookmarks.dispose()
  deletions.dispose()
})

const themeIcon = computed<IconName>(() =>
  settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'monitor',
)

const themeTitle = computed(() =>
  settings.theme === 'dark'
    ? t('themeDark')
    : settings.theme === 'light'
      ? t('themeLight')
      : t('themeAuto'),
)

const greeting = computed(() => t(greetingKey(now.value)))
</script>

<template>
  <div
    class="lm-bg flex h-screen flex-col overflow-hidden"
    :data-bg="settings.bgKind === 'wallpaper' ? 'wallpaper' : settings.solidBg"
  >
    <!-- 顶部工具行（不盖玻璃） -->
    <header class="flex shrink-0 items-center gap-2 px-5 py-3 text-slate-500 dark:text-slate-400">
      <div class="flex items-center gap-2">
        <span class="text-lg">🍃</span>
        <span
          class="hidden text-sm font-semibold tracking-wide text-slate-700 md:inline dark:text-slate-200"
        >
          {{ t('newTab') }}
        </span>
      </div>
      <div class="mx-2 h-4 w-px bg-slate-400/30" />
      <Breadcrumb class="min-w-0 flex-1" />
      <div class="flex items-center gap-1">
        <UndoDeleteButton />
        <button
          type="button"
          class="rounded-lg p-2 transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
          :title="themeTitle"
          @click="cycleTheme"
        >
          <Icon :name="themeIcon" />
        </button>
        <button
          type="button"
          class="rounded-lg p-2 transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
          :title="t('settings')"
          :aria-label="t('settings')"
          @click="settingsPanel?.show()"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>

    <!-- 书签区按内容收拢，超出可用高度后在内部滚动 -->
    <main class="flex min-h-0 flex-1 flex-col items-center px-4 pt-[clamp(1.25rem,5vh,3rem)] sm:px-6">
      <p v-if="settings.loadError" role="alert" class="mb-4 flex shrink-0 items-center gap-3 text-sm text-red-700 dark:text-red-300">
        {{ t('settingsLoadFailed') }}
        <button type="button" class="rounded-lg px-3 py-1 underline" @click="loadSettings">{{ t('retry') }}</button>
      </p>
      <!-- 时钟 + 问候（常驻，不参与滚动） -->
      <div v-if="settings.display.clock" class="mb-6 flex shrink-0 flex-col items-center sm:mb-8">
        <Clock :now="now" />
        <p class="mt-2 text-xs tracking-wide text-slate-500 dark:text-slate-400">{{ greeting }}</p>
      </div>

      <!-- 玻璃卡不再强制填满剩余空间；保留布局宽度设置 -->
      <div
        class="glass bookmark-island flex min-h-0 w-full min-w-[min(100%,20rem)] flex-col rounded-2xl p-4 sm:p-5"
        :style="{ width: `${settings.layout.containerWidth}%`, maxWidth: '100%' }"
      >
        <div class="bookmark-scroll min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="bookmarks.loading && bookmarks.tree.length === 0"
            class="py-16 text-center text-sm text-slate-400"
          >
            {{ t('loading') }}
          </div>
          <div
            v-else-if="bookmarks.error && bookmarks.tree.length === 0"
            class="flex flex-col items-center gap-3 py-16"
          >
            <p class="text-sm text-slate-500">{{ t('loadError') }}</p>
            <button
              type="button"
              class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              @click="bookmarks.load()"
            >
              {{ t('retry') }}
            </button>
          </div>
          <BookmarkGrid v-else />
        </div>
      </div>

      <p v-if="settings.display.stats" class="mt-3 shrink-0 text-center text-xs text-slate-500 dark:text-slate-400">
        {{ t('bookmarksCount', { n: stats.total }) }} · {{ t('openAllHint') }}
      </p>
    </main>

    <footer v-if="settings.display.yearProgress" class="flex shrink-0 justify-center px-6 pt-6 pb-5">
      <YearProgress :now="now" />
    </footer>

    <!-- 全局对话框 / 轻提示 / 引导 / 设置面板 -->
    <ConfirmDialog />
    <EditBookmarkDialog />
    <QrCodeDialog />
    <OnboardingOverlay />
    <SettingsPanel ref="settingsPanel" />
    <LinkCheckDialog />
    <DuplicateDialog />
    <ToastStack />
  </div>
</template>

<style>
/* 背景层：纯色/渐变 或 壁纸，挂在全屏最底层（2026-08-31 由整屏玻璃改为纯背景） */
.lm-bg {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.lm-bg[data-bg='wallpaper'] {
  background-image: var(--lm-bg-image);
}
.lm-bg[data-bg='gradient-emerald'] {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 50%, #ecfeff 100%);
}
html[data-theme='dark'] .lm-bg[data-bg='gradient-emerald'] {
  background: linear-gradient(135deg, #064e3b 0%, #022c22 50%, #0f172a 100%);
}
.lm-bg[data-bg='gradient-sky'] {
  background: linear-gradient(135deg, #bae6fd 0%, #e0f2fe 50%, #f0f9ff 100%);
}
html[data-theme='dark'] .lm-bg[data-bg='gradient-sky'] {
  background: linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0f172a 100%);
}
.lm-bg[data-bg='gradient-sunset'] {
  background: linear-gradient(135deg, #fed7aa 0%, #fecaca 50%, #fbcfe8 100%);
}
html[data-theme='dark'] .lm-bg[data-bg='gradient-sunset'] {
  background: linear-gradient(135deg, #7c2d12 0%, #9d174d 50%, #1e1b4b 100%);
}
.lm-bg[data-bg='gradient-slate'] {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #cbd5e1 100%);
}
html[data-theme='dark'] .lm-bg[data-bg='gradient-slate'] {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%);
}
</style>
