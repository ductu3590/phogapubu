// Khoá màn hình POS bằng mã PIN 4 số — phần THUẦN (không đụng React/DOM) để test được ở node.
//
// Lưu theo MÁY + theo TÀI KHOẢN (localStorage, khoá `mevo_pos_lock_v1_<userId>`), giống âm lượng chuông:
// - Mất mạng vẫn mở khoá được (máy quầy không được kẹt vì rớt wifi).
// - Chủ quán và thu ngân dùng chung một máy thì mỗi người một mã riêng.
//
// ⚠️ Đây là khoá "chống người đi ngang bấm bậy", KHÔNG phải ranh giới bảo mật: phiên đăng nhập vẫn
// còn nguyên phía sau, ai mở devtools xoá localStorage là qua. PIN 4 số chỉ băm cho khỏi để lộ chữ số
// thô khi ai đó liếc localStorage — 10.000 khả năng thì băm gì cũng dò ra được.

export const PIN_LENGTH = 4
export const MAX_FAILS = 5
export const COOLDOWN_MS = 30_000

/** `unset` = chưa từng đặt (bấm nút khoá → đặt mã) · `off` = đã tắt ở Bảo mật (ẩn nút) · `on` = đang bật. */
export type PinLockStatus = 'unset' | 'off' | 'on'

export type PinLockState = {
  status: PinLockStatus
  salt: string
  hash: string
  locked: boolean
}

export const EMPTY_STATE: PinLockState = { status: 'unset', salt: '', hash: '', locked: false }

export type KeyValueStorage = {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export function storageKey(userId: string): string {
  return `mevo_pos_lock_v1_${userId}`
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

// FNV-1a 32 bit, chạy đồng bộ, không cần crypto.subtle (máy quầy mở qua http IP LAN vẫn chạy).
export function hashPin(pin: string, salt: string): string {
  let h = 0x811c9dc5
  const s = `${salt}:${pin}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function newSalt(random: () => number = Math.random): string {
  return Array.from({ length: 4 }, () => Math.floor(random() * 0x10000).toString(16).padStart(4, '0')).join('')
}

export function parseState(raw: string | null): PinLockState {
  if (!raw) return EMPTY_STATE
  try {
    const v = JSON.parse(raw) as Partial<PinLockState>
    const status: PinLockStatus = v.status === 'on' || v.status === 'off' ? v.status : 'unset'
    const salt = typeof v.salt === 'string' ? v.salt : ''
    const hash = typeof v.hash === 'string' ? v.hash : ''
    // Bật mà không có mã (dữ liệu hỏng) → coi như chưa đặt, KHÔNG khoá: khoá mà không có mã là kẹt vĩnh viễn.
    if (status === 'on' && (!salt || !hash)) return EMPTY_STATE
    return { status, salt, hash, locked: status === 'on' && v.locked === true }
  } catch {
    return EMPTY_STATE
  }
}

export function readState(storage: KeyValueStorage | null, userId: string): PinLockState {
  if (!storage || !userId) return EMPTY_STATE
  try {
    return parseState(storage.getItem(storageKey(userId)))
  } catch {
    return EMPTY_STATE
  }
}

export function writeState(storage: KeyValueStorage | null, userId: string, state: PinLockState): void {
  if (!storage || !userId) return
  try {
    if (state.status === 'unset') storage.removeItem(storageKey(userId))
    else storage.setItem(storageKey(userId), JSON.stringify(state))
  } catch { /* bỏ qua: chế độ ẩn danh / chặn storage */ }
}

/** Đặt (hoặc đổi) mã: bật khoá; `lock` = khoá màn hình ngay sau khi đặt (lần đầu bấm nút trên POS). */
export function withNewPin(pin: string, lock: boolean, random?: () => number): PinLockState {
  if (!isValidPin(pin)) throw new Error('Mã PIN phải gồm đúng 4 chữ số')
  const salt = newSalt(random)
  return { status: 'on', salt, hash: hashPin(pin, salt), locked: lock }
}

export function verifyPin(state: PinLockState, pin: string): boolean {
  return state.status === 'on' && isValidPin(pin) && hashPin(pin, state.salt) === state.hash
}

/** Tắt ở Bảo mật: xoá luôn mã cũ — bật lại thì đặt mã mới. */
export function disabled(): PinLockState {
  return { status: 'off', salt: '', hash: '', locked: false }
}
