<script setup lang="ts">
// 新标签页布局（2026-08-31 重构）：居中浮岛
// 全屏只渲染背景（壁纸/渐变）；时钟浮岛 + 书签玻璃卡 + 底部统计
// 顶部工具行：面包屑（当前文件夹路径）/ 主题 / 设置
import { computed, onMounted, ref } from 'vue'

import BookmarkGrid from '@/components/BookmarkGrid.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'
import Clock from '@/components/Clock.vue'
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
import { useStatsStore } from '@/stores/stats'

const settings = useSettingsStore()
const bookmarks = useBookmarksStore()
const stats = useStatsStore()

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
    class="lm-bg flex h-screen flex-col overflow-hidden"
    :data-bg="settings.bgKind === 'wallpaper' ? 'wallpaper' : settings.solidBg"
  >
    <!-- 顶部工具行（不盖玻璃） -->
    <header
      class="flex shrink-0 items-center gap-2 px-5 py-3 text-slate-500 dark:text-slate-400"
    >
      <div class="flex items-center gap-2">
        <span class="text-lg">🍃</span>
        <span
          class="hidden text-sm font-semibold tracking-wide text-slate-700 md:inline dark:text-slate-200"
        >
          {{ t('appName') }}
        </span>
      </div>
      <div class="mx-2 h-4 w-px bg-slate-400/30" />
      <Breadcrumb class="min-w-0 flex-1" />
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-lg p-2 transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
          :title="themeTitle"
          @click="settings.cycleTheme()"
        >
          <Icon :name="themeIcon" />
        </button>
        <button
          type="button"
          class="rounded-lg p-2 transition-colors hover:bg-slate-500/10 dark:hover:bg-white/10"
          :title="t('settings')"
          @click="settingsPanel?.show()"
        >
          <Icon name="edit" />
        </button>
      </div>
    </header>

    <!-- 滚动内容区：时钟 + 书签玻璃卡 + 底部统计（整列居中） -->
    <div class="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
      <!-- 时钟 + 问候 -->
      <div class="flex shrink-0 flex-col items-center px-6 pt-6">
        <Clock />
        <p class="mt-4 text-base text-slate-600 dark:text-slate-300">{{ greeting }}</p>
      </div>

      <!-- 书签玻璃卡（固定宽度，内容自适应高度） -->
      <div
        class="glass mt-6 mb-4 flex w-full max-w-3xl flex-col rounded-3xl px-6 py-5"
        style="width: min(900px, calc(100vw - 3rem))"
      >
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

      <!-- 底部统计（淡色，无网络依赖） -->
      <footer class="shrink-0 pb-6 text-xs text-slate-400 dark:text-slate-500">
        {{ t('bookmarksCount', { n: stats.total }) }} · {{ t('openAllHint') }}
      </footer>
    </div>

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
