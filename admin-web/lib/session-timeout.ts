export function formatSessionIdleTimeout(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) return null

  const wholeMinutes = Math.round(minutes)
  const hours = Math.floor(wholeMinutes / 60)
  const remainingMinutes = wholeMinutes % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} giờ`)
  if (remainingMinutes > 0) parts.push(`${remainingMinutes} phút`)
  return parts.join(' ')
}

export function sessionTimeoutMessage(minutes: number | null | undefined): string {
  const duration = formatSessionIdleTimeout(minutes)
  return duration ? `Phiên đã hết hạn sau ${duration} không hoạt động` : 'Phiên đã hết hạn do không hoạt động'
}
