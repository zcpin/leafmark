<script setup lang="ts">
// 新标签页布局：主区（面包屑 / 主题切换 / 网格）+ 全局对话框
// （2026-08-27 修订：移除左侧侧边栏，导航由 面包屑 + 悬停级联 + 右键设为主页 承担）
import { computed, onMounted } from 'vue'

import BookmarkGrid from '@/components/BookmarkGrid.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import EditBookmarkDialog from '@/components/EditBookmarkDialog.vue'
import Icon, { type IconName } from '@/components/Icon.vue'
import ToastStack from '@/components/ToastStack.vue'
import { t } from '@/lib/i18n'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const bookmarks = useBookmarksStore()

onMounted(() => {
  void settings.init()
  void bookmarks.init()
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
</script>

<template>
  <div
    class="flex h-screen overflow-hidden bg-gradient-to-br from-sky-100 via-emerald-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"
  >
    <!-- 主区 -->
    <main class="glass m-3 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <header class="flex items-center gap-2 border-b border-white/40 px-4 py-2.5 dark:border-white/10">
        <div class="flex shrink-0 items-center gap-1.5">
          <span class="text-base">🍃</span>
          <span class="hidden text-sm font-semibold tracking-wide text-slate-700 md:inline dark:text-slate-200">
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
      </header>

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

    <!-- 全局对话框 / 轻提示 -->
    <ConfirmDialog />
    <EditBookmarkDialog />
    <ToastStack />
  </div>
</template>
