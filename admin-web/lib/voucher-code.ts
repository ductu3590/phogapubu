// Sinh code mã shipper khó đoán. Code CHƯA kích hoạt = bí mật trao tay cho shipper
// (spec 8.1) → bắt buộc tự sinh, không cho tự đặt code ngắn.
// Alphabet bỏ I, L, O, 0, 1 để đọc qua điện thoại không nhầm.
export const SHIPPER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateShipperCode(rand: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += SHIPPER_CODE_ALPHABET[Math.floor(rand() * SHIPPER_CODE_ALPHABET.length)]
  }
  return `SHIP-${s}`
}
