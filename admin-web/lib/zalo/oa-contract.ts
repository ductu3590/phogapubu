import { createHash, timingSafeEqual } from 'node:crypto'

export type NormalizedOaMessage = {
  appId: string
  oaId: string
  senderOaUserId: string
  messageId: string
  text: string
  timestamp: number
}

export class UnsupportedOaEventError extends Error {}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function requiredString(value: unknown, label: string): string {
  const result = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
  if (!result) throw new Error(`Thiếu ${label} trong webhook Zalo OA`)
  return result
}

function signatureDigest(header: string): string {
  const normalized = header.trim().replace(/^mac\s*=\s*/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Thiếu hoặc sai chữ ký webhook Zalo OA')
  }
  return normalized
}

function signaturesEqual(actualHex: string, expectedHex: string): boolean {
  const actual = Buffer.from(actualHex, 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Zalo OA ký webhook bằng SHA-256(appId + raw JSON + timestamp + OA secret).
 * Phải dùng nguyên văn raw body; parse rồi stringify/sort field sẽ làm sai chữ ký.
 * https://developers.zalo.me/docs/v2/official-account/webhook/tin-nhan/su-kien-official-account-gui-tin-nhan-cho-nguoi-dung
 */
export function verifyAndNormalizeOaWebhook(
  rawBody: string,
  signatureHeader: string,
  oaSecret: string,
): NormalizedOaMessage {
  const actualSignature = signatureDigest(signatureHeader)
  if (!oaSecret.trim()) throw new Error('Thiếu OA secret để xác minh chữ ký')

  let payload: UnknownRecord
  try {
    const parsed = asRecord(JSON.parse(rawBody))
    if (!parsed) throw new Error('not-object')
    payload = parsed
  } catch {
    throw new Error('Payload webhook Zalo OA không hợp lệ')
  }

  const appId = requiredString(payload.app_id, 'app_id')
  const timestampRaw = requiredString(payload.timestamp, 'timestamp')
  if (!/^\d{10,16}$/.test(timestampRaw)) throw new Error('Timestamp webhook Zalo OA không hợp lệ')

  const expectedSignature = createHash('sha256')
    .update(`${appId}${rawBody}${timestampRaw}${oaSecret}`)
    .digest('hex')
  if (!signaturesEqual(actualSignature, expectedSignature)) {
    throw new Error('Sai chữ ký webhook Zalo OA')
  }

  if (payload.event_name !== 'user_send_text') {
    throw new UnsupportedOaEventError('Sự kiện webhook Zalo OA không hỗ trợ')
  }

  const sender = asRecord(payload.sender)
  const recipient = asRecord(payload.recipient)
  const message = asRecord(payload.message)
  if (!sender || !recipient || !message) throw new Error('Thiếu dữ liệu tin nhắn webhook Zalo OA')

  return {
    appId,
    oaId: requiredString(recipient.id, 'recipient.id'),
    senderOaUserId: requiredString(sender.id, 'sender.id'),
    messageId: requiredString(message.msg_id, 'message.msg_id'),
    text: requiredString(message.text, 'message.text'),
    timestamp: Number(timestampRaw),
  }
}
