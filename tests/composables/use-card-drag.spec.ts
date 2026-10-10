import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useCardDrag } from '@/composables/useCardDrag'
import { findNode } from '@/lib/tree-utils'
import type { BookmarkNode } from '@/lib/types'
import { useBookmarksStore } from '@/stores/bookmarks'
import { useSelectionStore } from '@/stores/selection'
import { useUiStore } from '@/stores/ui'
import { SAMPLE_TREE, chromeMock } from '../mocks/chrome'

const devFolder = findNode(SAMPLE_TREE, '10') as BookmarkNode
const github = findNode(SAMPLE_TREE, '100') as BookmarkNode

/** 构造一个够用的 DragEvent：只用到 preventDefault / dataTransfer / clientX */
function dragEvent(options: { clientX?: number; dataTransfer?: DataTransfer | null } = {}) {
  return {
    preventDefault: vi.fn(),
    clientX: options.clientX ?? 90,
    dataTransfer: options.dataTransfer ?? null,
  } as unknown as DragEvent
}

function transfer(sourceId?: string) {
  const dt = new DataTransfer()
  if (sourceId) dt.setData('text/plain', sourceId)
  return dt
}

describe('useCardDrag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /** 卡片锚点：可指定是否有几何信息（测「拿不到 rect」的分支） */
  function setup(node: BookmarkNode, options: { rect?: boolean; resultMode?: boolean } = {}) {
    const bookmarks = useBookmarksStore()
    const selection = useSelectionStore()
    const ui = useUiStore()
    const cardEl = ref<HTMLElement | undefined>(
      options.rect === false
        ? undefined
        : ({
            getBoundingClientRect: () => ({
              left: 0,
              width: 100,
              top: 0,
              bottom: 48,
              height: 48,
              right: 100,
            }),
            contains: () => false,
          } as unknown as HTMLElement),
    )
    const onBegin = vi.fn()
    const drag = useCardDrag({
      node: () => node,
      isDir: () => !node.url,
      resultMode: () => options.resultMode === true,
      cardEl,
      onBegin,
    })
    return { drag, bookmarks, selection, ui, cardEl, onBegin }
  }

  it('dragstart 写入拖拽源并关闭悬停面板', async () => {
    const { drag, bookmarks, onBegin } = setup(github)
    await bookmarks.init()
    const dt = transfer()
    const event = dragEvent({ dataTransfer: dt })

    drag.onDragStart(event)

    expect(drag.dragging.value).toBe(true)
    expect(bookmarks.draggingId).toBe('100')
    expect(dt.getData('text/plain')).toBe('100')
    expect(dt.effectAllowed).toBe('move')
    expect(onBegin).toHaveBeenCalledOnce()
  })

  it('多选态下 dragstart 被阻止，不产生拖拽源', async () => {
    const { drag, bookmarks, selection, onBegin } = setup(github)
    await bookmarks.init()
    selection.start(devFolder)
    await nextTick()
    const event = dragEvent({ dataTransfer: transfer() })

    drag.onDragStart(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(drag.dragging.value).toBe(false)
    expect(bookmarks.draggingId).toBeNull()
    expect(onBegin).not.toHaveBeenCalled()
  })

  it('dragend 只清除属于自己的拖拽源', async () => {
    const { drag, bookmarks } = setup(github)
    await bookmarks.init()
    drag.onDragStart(dragEvent({ dataTransfer: transfer() }))
    bookmarks.draggingId = '999'

    drag.onDragEnd()

    expect(drag.dragging.value).toBe(false)
    expect(drag.dropZone.value).toBeNull()
    // 不是自己发起的拖拽，交还给原发起方清理
    expect(bookmarks.draggingId).toBe('999')

    bookmarks.draggingId = '100'
    drag.onDragEnd()
    expect(bookmarks.draggingId).toBeNull()
  })

  it('dragover 命中合法落点时给出插入线', async () => {
    const { drag, bookmarks } = setup(findNode(SAMPLE_TREE, '101') as BookmarkNode)
    await bookmarks.init()
    bookmarks.setViewFolder('10')
    const dt = transfer('100')
    const event = dragEvent({ clientX: 90, dataTransfer: dt })

    drag.onDragOver(event)

    expect(drag.dropZone.value).toBe('after')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(dt.dropEffect).toBe('move')
  })

  it('来源非法时拒绝落点', async () => {
    const { drag, bookmarks } = setup(findNode(SAMPLE_TREE, '101') as BookmarkNode)
    await bookmarks.init()
    bookmarks.setViewFolder('10')
    const dt = transfer('999')
    const event = dragEvent({ clientX: 90, dataTransfer: dt })

    drag.onDragOver(event)

    expect(drag.dropZone.value).toBeNull()
    expect(dt.dropEffect).toBe('none')
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('拿不到卡片几何信息时 dragover 直接放弃', async () => {
    const { drag, bookmarks } = setup(github, { rect: false })
    await bookmarks.init()
    const event = dragEvent({ dataTransfer: transfer('100') })

    drag.onDragOver(event)

    expect(drag.dropZone.value).toBeNull()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('结果视图不参与拖放', async () => {
    const { drag, bookmarks } = setup(github, { resultMode: true })
    await bookmarks.init()
    const over = dragEvent({ dataTransfer: transfer('100') })
    const drop = dragEvent({ dataTransfer: transfer('100') })

    drag.onDragOver(over)
    drag.onDrop(drop)

    expect(drag.dropZone.value).toBeNull()
    expect(drop.preventDefault).not.toHaveBeenCalled()
    expect(chromeMock.bookmarks.move).not.toHaveBeenCalled()
  })

  it('drop 缺少来源 id 时不移动', async () => {
    const { drag, bookmarks } = setup(github)
    await bookmarks.init()
    const move = vi.spyOn(bookmarks, 'moveBookmark')

    await drag.onDrop(dragEvent({ dataTransfer: transfer() }))

    expect(move).not.toHaveBeenCalled()
  })

  it('drop 无几何信息时文件夹按「移入」、书签按「排到后面」', async () => {
    const { drag, bookmarks } = setup(devFolder, { rect: false })
    await bookmarks.init()
    bookmarks.setViewFolder('1')
    const move = vi.spyOn(bookmarks, 'moveBookmark').mockResolvedValue(undefined)

    await drag.onDrop(dragEvent({ dataTransfer: transfer('11') }))

    expect(move).toHaveBeenCalledWith('11', '10', 0)
  })

  it('移动失败时提示并重新加载书签树', async () => {
    const { drag, bookmarks, ui } = setup(findNode(SAMPLE_TREE, '101') as BookmarkNode)
    await bookmarks.init()
    bookmarks.setViewFolder('10')
    const toast = vi.spyOn(ui, 'toast').mockImplementation(() => {})
    const load = vi.spyOn(bookmarks, 'load').mockResolvedValue(undefined)
    vi.spyOn(bookmarks, 'moveBookmark').mockRejectedValue(new Error('move failed'))

    await drag.onDrop(dragEvent({ clientX: 90, dataTransfer: transfer('100') }))

    expect(toast).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledOnce()
    expect(bookmarks.draggingId).toBeNull()
  })

  it('reset 只清落点，不影响拖拽中的卡片', async () => {
    const { drag } = setup(github)
    drag.dropZone.value = 'before'

    drag.reset()

    expect(drag.dropZone.value).toBeNull()
    expect(drag.dragging.value).toBe(false)
  })
})
