// 时段问候语（F7）：根据本地小时数返回对应问候 key
import type { MessageKey } from './i18n'

export function greetingKey(date = new Date()): MessageKey {
  const h = date.getHours()
  if (h < 5) return 'welcomeNight'
  if (h < 12) return 'welcomeMorning'
  if (h < 18) return 'welcomeAfternoon'
  if (h < 22) return 'welcomeEvening'
  return 'welcomeNight'
}
