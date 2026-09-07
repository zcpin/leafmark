import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

/** 时钟、问候和年度进度共用一个对齐整分钟的时间源。 */
export function useNow() {
  const now = ref(new Date())
  let timer: number | undefined

  function update() {
    window.clearTimeout(timer)
    now.value = new Date()
    const delay = 60_000 - (now.value.getSeconds() * 1000 + now.value.getMilliseconds())
    timer = window.setTimeout(update, delay)
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') update()
  }

  onMounted(() => {
    update()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return readonly(now)
}
