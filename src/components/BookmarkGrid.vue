<script setup lang="ts">
// 当前文件夹内容的卡片网格（A3）+ 空白区拖放（A4：拖到网格空白 → 移到末尾）
// 滚动容器由本组件持有，大目录启用窗口化渲染：只挂载视口附近的行，
// 其余用上下占位高度撑开，滚动条位置与小目录完全一致。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { t } from '@/lib/i18n'
import { resolveGridDrop } from '@/lib/drag-utils'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useSelectionStore } from '@/stores/selection'

import type { BookmarkNode } from '@/lib/types'

import BookmarkCard from './BookmarkCard.vue'

const props = withDefaults(
  defineProps<{
    /** 数据源；缺省取当前目录（搜索结果视图传入命中列表） */
    items?: BookmarkNode[] | null
    /** 结果视图里的卡片副标题：node.id → 所在文件夹标题链 */
    paths?: ReadonlyMap<string, string[]> | null
    /** 结果视图：关闭空白区拖放（跨目录落点没有明确语义） */
    resultsMode?: boolean
  }>(),
  { items: null, paths: null, resultsMode: false },
)

/** 网格间距（gap-3）的兜底值；能读到 computed style 时以实际值为准 */
const GAP_FALLBACK = 12
/** 视口上下各多渲染几行，避免快速滚动时出现空白 */
const OVERSCAN_ROWS = 2
/**
 * 少于该数量的目录不虚拟化：全量挂载更省事，也避免测量误差影响小目录。
 * 超过该值后，挂载成本才是主要开销（见 docs/03-实现计划.md 的渲染基线）。
 */
const VIRTUAL_MIN_ITEMS = 60

const bookmarks = useBookmarksStore()
const settings = useSettingsStore()
const ui = useUiStore()
const selection = useSelectionStore()
const children = computed<BookmarkNode[]>(() => props.items ?? bookmarks.currentChildren)

const scrollerEl = ref<HTMLElement>()
const gridEl = ref<HTMLElement>()

const dropOverGrid = ref(false)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const columns = ref(0)
const gap = ref(GAP_FALLBACK)

const rowHeight = computed(() => settings.layout.cardHeight)
const rowStride = computed(() => rowHeight.value + gap.value)
const virtualEnabled = computed(
  () => children.value.length > VIRTUAL_MIN_ITEMS && columns.value > 0 && viewportHeight.value > 0,
)
const rowCount = computed(() =>
  columns.value > 0 ? Math.ceil(children.value.length / columns.value) : 0,
)
const startRow = computed(() => {
  if (!virtualEnabled.value) return 0
  const raw = Math.floor(scrollTop.value / rowStride.value) - OVERSCAN_ROWS
  // scrollTop 超出内容时浏览器会夹紧，这里同样夹紧，避免窗口整体滑出内容之外
  return Math.min(Math.max(0, raw), Math.max(0, rowCount.value - 1))
})
const endRow = computed(() =>
  virtualEnabled.value
    ? Math.min(
        rowCount.value,
        Math.ceil((scrollTop.value + viewportHeight.value) / rowStride.value) + OVERSCAN_ROWS,
      )
    : rowCount.value,
)
const rendered = computed(() =>
  virtualEnabled.value
    ? children.value.slice(startRow.value * columns.value, endRow.value * columns.value)
    : children.value,
)
const padTop = computed(() => (virtualEnabled.value ? startRow.value * rowStride.value : 0))
const padBottom = computed(() =>
  virtualEnabled.value ? Math.max(0, (rowCount.value - endRow.value) * rowStride.value) : 0,
)
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, var(--lm-card-width, 200px)), 1fr))`,
}))

// —— 方向键网格导航（roving tabindex）——
// 只有一张卡片持有 tabindex=0，其余为 -1；方向键在网格内移动焦点并把目标行滚入视口。
const focusIndex = ref(0)
const renderedStart = computed(() => (virtualEnabled.value ? startRow.value * columns.value : 0))
const renderedEnd = computed(() => renderedStart.value + rendered.value.length)
/** 实际持有 tabindex=0 的下标：焦点项不在窗口内时退到窗口内的最近一项 */
const rovingIndex = computed(() =>
  Math.min(Math.max(focusIndex.value, renderedStart.value), Math.max(0, renderedEnd.value - 1)),
)

function cardElement(index: number): HTMLElement | null {
  return gridEl.value?.querySelector<HTMLElement>(`[data-card-index="${index}"]`) ?? null
}

/** 把目标行滚进视口；虚拟化时窗口由 scrollTop 决定，必须同步更新后再渲染 */
function ensureRowVisible(index: number) {
  const scroller = scrollerEl.value
  if (!scroller || !virtualEnabled.value || columns.value <= 0) return
  const top = Math.floor(index / columns.value) * rowStride.value
  const bottom = top + rowHeight.value
  if (top < scroller.scrollTop) scroller.scrollTop = top
  else if (bottom > scroller.scrollTop + viewportHeight.value) {
    scroller.scrollTop = bottom - viewportHeight.value
  }
  // 滚动事件是异步派发的，这里同步对齐，保证下一次渲染的窗口包含目标行
  scrollTop.value = scroller.scrollTop
}

function moveFocus(index: number) {
  const count = children.value.length
  if (count === 0) return
  const next = Math.min(count - 1, Math.max(0, index))
  focusIndex.value = next
  ensureRowVisible(next)
  void nextTick(() => cardElement(next)?.focus())
}

function onGridKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target instanceof Element ? event.target.closest('[data-card-index]') : null
  const current = Number((target as HTMLElement | null)?.dataset.cardIndex)
  if (!target || !Number.isFinite(current)) return

  // 测不到列数时按单列处理，上下键退化为前后移动
  const cols = Math.max(1, columns.value)
  let next: number
  switch (event.key) {
    case 'ArrowLeft':
      next = current - 1
      break
    case 'ArrowRight':
      next = current + 1
      break
    case 'ArrowUp':
      next = current - cols
      break
    case 'ArrowDown':
      next = current + cols
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = children.value.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  moveFocus(next)
}

/** 点击或 Tab 进入某张卡片后，让 roving tabindex 跟随实际焦点 */
function onGridFocusIn(event: FocusEvent) {
  const target = event.target instanceof Element ? event.target.closest('[data-card-index]') : null
  const index = Number((target as HTMLElement | null)?.dataset.cardIndex)
  if (target && Number.isFinite(index)) focusIndex.value = index
}

/** 读取真实布局：列数来自展开后的 grid-template-columns，行距来自 computed style。 */
function measure() {
  const scroller = scrollerEl.value
  const grid = gridEl.value
  if (!scroller || !grid) return
  viewportHeight.value = scroller.clientHeight
  const styles = getComputedStyle(grid)
  const parsedGap = styles.rowGap ? Number.parseFloat(styles.rowGap) : Number.NaN
  gap.value = Number.isFinite(parsedGap) ? parsedGap : GAP_FALLBACK
  columns.value = countColumns(styles.gridTemplateColumns) || estimateColumns(scroller.clientWidth)
}

/**
 * 浏览器对 grid-template-columns 返回的是使用值（像素轨道列表）。
 * 元素未参与布局时会回落到声明值（含 repeat/minmax），此时不能当列数用。
 */
function countColumns(value: string | undefined): number {
  if (!value || value.includes('repeat(') || value.includes('minmax(')) return 0
  return value.split(' ').filter(Boolean).length
}

/** 拿不到真实轨道时的兜底：按容器宽度与卡片宽度估算。 */
function estimateColumns(width: number): number {
  return Math.max(1, Math.floor(width / Math.max(1, settings.layout.cardWidth + gap.value)))
}

function onScroll() {
  scrollTop.value = scrollerEl.value?.scrollTop ?? 0
}

let observer: ResizeObserver | null = null
let usingWindowResize = false

onMounted(() => {
  measure()
  scrollerEl.value?.addEventListener('scroll', onScroll, { passive: true })
  if (typeof ResizeObserver !== 'undefined' && scrollerEl.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(scrollerEl.value)
  } else {
    usingWindowResize = true
    window.addEventListener('resize', measure)
  }
})

onBeforeUnmount(() => {
  scrollerEl.value?.removeEventListener('scroll', onScroll)
  observer?.disconnect()
  observer = null
  if (usingWindowResize) window.removeEventListener('resize', measure)
})

// 切换目录时浏览器的 scrollTop 可能已归零但不触发 scroll 事件；卡片尺寸变化需重新测量。
watch([children, () => settings.layout.cardWidth, () => settings.layout.cardHeight], () => {
  scrollTop.value = scrollerEl.value?.scrollTop ?? 0
  if (focusIndex.value >= children.value.length) focusIndex.value = 0
  void nextTick(measure)
})

function onGridDragOver(e: DragEvent) {
  if (selection.active || props.resultsMode) return
  const sourceId = bookmarks.draggingId || e.dataTransfer?.getData('text/plain')
  if (
    !sourceId ||
    !bookmarks.currentFolder ||
    !resolveGridDrop(bookmarks.tree, sourceId, bookmarks.currentFolder.id)
  )
    return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropOverGrid.value = true
}

/** 拖到空白区：移到当前文件夹末尾 */
async function onGridDrop(e: DragEvent) {
  if (props.resultsMode) return
  e.preventDefault()
  dropOverGrid.value = false
  if (selection.active) return
  const sourceId = e.dataTransfer?.getData('text/plain')
  const parentId = bookmarks.currentFolder?.id
  try {
    if (!sourceId || !parentId) return
    const target = resolveGridDrop(bookmarks.tree, sourceId, parentId)
    if (target) await bookmarks.moveBookmark(sourceId, target.parentId, target.index)
  } catch {
    ui.toast(t('bookmarkMoveFailed'))
    await bookmarks.load()
  } finally {
    bookmarks.draggingId = null
  }
}
</script>

<template>
  <div
    ref="scrollerEl"
    class="bookmark-scroll min-h-0 flex-1 overflow-y-auto"
    :class="{ 'rounded-2xl ring-2 ring-dashed ring-emerald-400/50': dropOverGrid }"
    @dragover="onGridDragOver"
    @dragleave.self="dropOverGrid = false"
    @drop="onGridDrop"
    @keydown="onGridKeydown"
    @focusin="onGridFocusIn"
  >
    <div
      v-if="children.length === 0"
      class="flex h-full flex-col items-center justify-center gap-2 py-20 text-center"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        class="size-12 text-slate-300 dark:text-slate-600"
      >
        <path
          d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
        />
      </svg>
      <p class="text-sm font-medium text-slate-500 dark:text-slate-400">{{ t('emptyFolder') }}</p>
      <p class="text-xs text-slate-400 dark:text-slate-500">{{ t('emptyFolderHint') }}</p>
    </div>

    <div v-else :style="{ paddingTop: `${padTop}px`, paddingBottom: `${padBottom}px` }">
      <div ref="gridEl" class="grid gap-3" :style="gridStyle">
        <BookmarkCard
          v-for="(node, i) in rendered"
          :key="node.id"
          :node="node"
          :index="renderedStart + i"
          :tab-index="renderedStart + i === rovingIndex ? 0 : -1"
          :path="props.paths?.get(node.id)"
          :result-mode="props.resultsMode"
        />
      </div>
    </div>
  </div>
</template>
