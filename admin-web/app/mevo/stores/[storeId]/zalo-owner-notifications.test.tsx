import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/zalo-owner-notifications', () => ({
  createOwnerOaChallenge: vi.fn(),
  disableOwnerOaRecipient: vi.fn(),
}))

const { default: ZaloOwnerNotifications } = await import('./zalo-owner-notifications')

describe('ZaloOwnerNotifications', () => {
  it('hiển thị trạng thái credential/recipient và URL webhook nhưng không lộ secret', () => {
    const html = renderToStaticMarkup(
      <ZaloOwnerNotifications
        storeId="store-1"
        initialState={{
          hasOaId: true,
          hasMiniAppId: true,
          hasAccessToken: true,
          hasAppSecret: false,
          configEnabled: true,
          recipientStatus: 'verified',
          verifiedAt: '2026-09-21T00:00:00Z',
          lastTestedAt: null,
          lastTestStatus: null,
          webhookPath: '/api/zalo-oa-webhook/store-1',
        }}
      />,
    )
    expect(html).toContain('OA ID')
    expect(html).toContain('Access Token')
    expect(html).toContain('App Secret')
    expect(html).toContain('Còn thiếu')
    expect(html).toContain('Đã xác minh')
    expect(html).toContain('/api/zalo-oa-webhook/store-1')
    expect(html).toContain('Tạo mã kết nối')
    expect(html).not.toContain('owner-uid')
  })
})
