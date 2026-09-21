import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyAndNormalizeOaWebhook } from './oa-contract'

const raw = '{"app_id":"app-123","sender":{"id":"owner-uid-456"},"recipient":{"id":"oa-789"},"event_name":"user_send_text","message":{"text":"MEVO A1B2C3D4E5F60718293A4B5C","msg_id":"msg-001"},"timestamp":"1789952400000"}'
const signature = 'mac=dd5138872a92db374ab3ad74a85441e28b22073de73b5b28628ab04e1cd9ce00'

function sign(payload: string) {
  const parsed = JSON.parse(payload) as { app_id: string; timestamp: string }
  return `mac=${createHash('sha256')
    .update(`${parsed.app_id}${payload}${parsed.timestamp}oa-secret-test`)
    .digest('hex')}`
}

describe('verifyAndNormalizeOaWebhook', () => {
  it('xác minh fixture theo appId + raw JSON + timestamp + OA secret', () => {
    expect(verifyAndNormalizeOaWebhook(raw, signature, 'oa-secret-test')).toEqual({
      appId: 'app-123',
      oaId: 'oa-789',
      senderOaUserId: 'owner-uid-456',
      messageId: 'msg-001',
      text: 'MEVO A1B2C3D4E5F60718293A4B5C',
      timestamp: 1789952400000,
    })
  })

  it.each([
    ['', 'oa-secret-test'],
    ['mac=00', 'oa-secret-test'],
    [signature, 'wrong-secret'],
  ])('từ chối chữ ký thiếu hoặc sai', (header, secret) => {
    expect(() => verifyAndNormalizeOaWebhook(raw, header, secret)).toThrow('chữ ký')
  })

  it('chữ ký bám raw body, không sort hoặc stringify lại payload', () => {
    const reformatted = raw.replace('{"app_id"', '{\n  "app_id"')
    expect(() => verifyAndNormalizeOaWebhook(reformatted, signature, 'oa-secret-test')).toThrow('chữ ký')
  })

  it('từ chối payload thiếu identity bắt buộc', () => {
    expect(() => verifyAndNormalizeOaWebhook('{}', signature, 'oa-secret-test')).toThrow('Thiếu')
  })

  it.each([
    [raw.replace('user_send_text', 'user_send_image'), 'không hỗ trợ'],
    [raw.replace('"msg_id":"msg-001"', '"msg_id":""'), 'Thiếu'],
  ])('từ chối payload không phải tin nhắn text đầy đủ', (payload, message) => {
    expect(() => verifyAndNormalizeOaWebhook(payload, sign(payload), 'oa-secret-test')).toThrow(message)
  })
})
