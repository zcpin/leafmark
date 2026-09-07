const DAY_MS = 86_400_000

/** 按本地日历计算年度与各月进度；剩余天数包含今天，不受夏令时影响。 */
export function getYearProgress(now: Date) {
  const year = now.getFullYear()
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  const timestamp = now.getTime()
  const percent = ((timestamp - start) / (end - start)) * 100
  const daysRemaining =
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, now.getMonth(), now.getDate())) / DAY_MS

  const months = Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1).getTime()
    const monthEnd = new Date(year, month + 1, 1).getTime()
    return Math.max(0, Math.min(100, ((timestamp - monthStart) / (monthEnd - monthStart)) * 100))
  })

  return { year, percent, daysRemaining, months }
}
