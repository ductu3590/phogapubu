import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/reservation-group-notifications', () => ({
  saveGroupNotificationChannel: vi.fn(), disableGroupNotificationChannel: vi.fn(), sendGroupNotificationTest: vi.fn(),
}))

const { default: ReservationGroupNotifications } = await import('./reservation-group-notifications')

describe('ReservationGroupNotifications', () => {
  it('hiển thị cảnh báo nội bộ và health nhưng không render group ID', () => {
    const html = renderToStaticMarkup(
      <ReservationGroupNotifications storeId="store-1" initialState={{
        provider: 'zca_group', enabled: true, hasDestination: true,
        lastDeliveryStatus: 'sent', lastDeliveryAt: '2026-09-22T00:00:00Z', lastProviderCode: 'OK',
      }} />,
    )
    expect(html).toContain('Thông báo nội bộ')
    expect(html).toContain('best-effort')
    expect(html).toContain('Gửi tin thử')
    expect(html).toContain('Tắt cảnh báo')
    expect(html).not.toContain('group-secret')
  })
})
