<script setup lang="ts">
// 新标签页布局：主区（欢迎语 / 面包屑 / 主题切换 / 设置 / 网格）+ 全局对话框
// （2026-08-27 修订：移除左侧侧边栏，导航由 面包屑 + 悬停级联 + 右键设为主页 承担）
import { computed, onMounted, ref } from 'vue'

import BookmarkGrid from '@/components/BookmarkGrid.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EditBookmarkDialog from '@/components/EditBookmarkDialog.vue'
import Icon, { type IconName } from '@/components/Icon.vue'
import OnboardingOverlay from '@/components/OnboardingOverlay.vue'
import QrCodeDialog from '@/components/QrCodeDialog.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import ToastStack from '@/components/ToastStack.vue'
import { greetingKey } from '@/lib/greeting'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const bookmarks = useBookmarksStore()

// 设置面板实例（仅用于调用 show()）
const settingsPanel = ref<{ show: () => void } | null>(null)

onMounted(() => {
  void settings.init()
  void bookmarks.init()
})

const themeIcon = computed<IconName>(() =>
  settings.theme === 'dark'
    ? 'moon'
    : settings.theme === 'light'
      ? 'sun'
      : 'monitor',
)

const themeTitle = computed(() =>
  settings.theme === 'dark'
    ? t('themeDark')
    : settings.theme === 'light'
      ? t('themeLight')
      : t('themeAuto'),
)

const greeting = computed(() => t(greetingKey()))
</script>

<template>
  <div
    class="lm-bg flex h-screen overflow-hidden"
    :data-bg="settings.bgKind === 'wallpaper' ? 'wallpaper' : settings.solidBg"
  >
    <!-- 主区 -->
    <main
      class="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl"
      style="margin: 0.75rem; width: var(--lm-container-width, 85%); max-width: var(--lm-container-width, 85%)"
    >
      <header class="flex items-center gap-2 border-b border-white/40 px-4 py-2.5 dark:border-white/10">
        <div class="flex shrink-0 items-center gap-1.5">
          <span class="text-base">🍃</span>
          <span
            class="hidden text-sm font-semibold tracking-wide text-slate-700 md:inline dark:text-slate-200"
          >
            {{ t('appName') }}
          </span>
        </div>
        <div class="mx-1 h-4 w-px shrink-0 bg-slate-400/30" />
        <Breadcrumb class="min-w-0 flex-1" />
        <button
          type="button"
          class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-500/10 dark:text-slate-400 dark:hover:bg-white/10"
          :title="themeTitle"
          @click="settings.cycleTheme()"
        >
          <Icon :name="themeIcon" />
        </button>
        <button
          type="button"
          class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-500/10 dark:text-slate-400 dark:hover:bg-white/10"
          :title="t('settings')"
          @click="settingsPanel?.show()"
        >
          <Icon name="edit" />
        </button>
      </header>

      <!-- 欢迎语（F7） -->
      <div class="px-4 pt-4 text-center">
        <h1
          class="text-2xl font-semibold text-slate-700 drop-shadow-sm dark:text-slate-100"
          style="--lm-greeting-opacity: 0.85"
        >
          {{ greeting }}
        </h1>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <div
          v-if="bookmarks.loading && bookmarks.tree.length === 0"
          class="flex h-full items-center justify-center text-sm text-slate-400"
        >
          {{ t('loading') }}
        </div>

        <div
          v-else-if="bookmarks.error && bookmarks.tree.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3"
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
    </main>

    <!-- 全局对话框 / 轻提示 / 引导 / 设置面板 -->
    <ConfirmDialog />
    <EditBookmarkDialog />
    <QrCodeDialog />
    <OnboardingOverlay />
    <SettingsPanel ref="settingsPanel" />
    <ToastStack />
  </div>
</template>

<style>
/* 背景层：纯色/渐变 或 壁纸，挂在最外层 */
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
.dark .lm-bg[data-bg='gradient-emerald'] {
  background: linear-gradient(135deg, #064e3b 0%, #022c22 50%, #0f172a 100%);
}
.lm-bg[data-bg='gradient-sky'] {
  background: linear-gradient(135deg, #bae6fd 0%, #e0f2fe 50%, #f0f9ff 100%);
}
.dark .lm-bg[data-bg='gradient-sky'] {
  background: linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0f172a 100%);
}
.lm-bg[data-bg='gradient-sunset'] {
  background: linear-gradient(135deg, #fed7aa 0%, #fecaca 50%, #fbcfe8 100%);
}
.dark .lm-bg[data-bg='gradient-sunset'] {
  background: linear-gradient(135deg, #7c2d12 0%, #9d174d 50%, #1e1b4b 100%);
}
.lm-bg[data-bg='gradient-slate'] {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #cbd5e1 100%);
}
.dark .lm-bg[data-bg='gradient-slate'] {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%);
}
</style>
