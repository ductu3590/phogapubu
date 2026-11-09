// Kết quả một lần bấm "Đã nhận tiền" (collect_table_bill, mig 112a) đổi sang việc UI phải làm. Dùng chung cho
// POS, /staff/tables và ngăn kéo A04 để ba nơi xử lý mất mạng / bill đổi giống nhau.
//   • done  — thu xong (hoặc đã thu từ trước: cùng mã gửi lại, hay máy khác vừa chốt) → đóng màn, tải lại.
//   • stale — server tự tính ra số khác số đang hiện (bill vừa đổi) → bỏ số cũ, đọc bill mới rồi thu lại.
//   • retry — lỗi khác hoặc mất mạng → GIỮ màn và GIỮ mã chống trùng; bấm lại an toàn vì lần lỗi không ghi gì,
//             còn nếu lần trước đã thu mà mất phản hồi thì cùng mã trả 'already'.

export const AMOUNT_MISMATCH = 'Số tiền không khớp bill'
export const ALREADY_COLLECTED = 'Bàn này đã được chốt xong.'
export const NETWORK_RETRY = 'Lỗi kết nối. Bấm thu lại — cùng một lần thu nên không bị ghi trùng.'

export type CollectOutcome =
  | { kind: 'done'; message: string | null }
  | { kind: 'stale'; error: string }
  | { kind: 'retry'; error: string }

export function isAmountMismatch(error: string | null | undefined): boolean {
  return !!error && error.includes(AMOUNT_MISMATCH)
}

/** Chạy lời gọi thu tiền; không bao giờ ném. */
export async function runCollect(
  call: () => Promise<{ ok: true; already?: boolean } | { ok: false; error: string }>,
): Promise<CollectOutcome> {
  let res: Awaited<ReturnType<typeof call>>
  try {
    res = await call()
  } catch {
    return { kind: 'retry', error: NETWORK_RETRY }
  }
  if (!res.ok) return isAmountMismatch(res.error) ? { kind: 'stale', error: res.error } : { kind: 'retry', error: res.error }
  return { kind: 'done', message: res.already ? ALREADY_COLLECTED : null }
}
