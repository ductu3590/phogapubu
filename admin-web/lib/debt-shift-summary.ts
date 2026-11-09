import { parseDebtShiftSummary, type DebtShiftSummary } from '@/lib/debts'

// Đọc công nợ trong một ca (RPC get_debt_shift_summary, mig 123) bằng client CÓ DANH TÍNH người dùng: trang
// /print/shift-report (phiên đăng nhập) và /print/agent (JWT người tạo phiếu). RPC tự kiểm quyền: chủ quán / quản
// lý, hoặc thu ngân đã mở / kết ca đó. Mọi lỗi (không quyền, mạng, dữ liệu lạ) → null: phiếu vẫn in, chỉ thiếu khối nợ.
// Không import gì của next/* để dùng được ở cả hai nơi và trong test.
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export async function readDebtShiftSummary(client: RpcClient, shiftId: string): Promise<DebtShiftSummary | null> {
  try {
    const { data, error } = await client.rpc('get_debt_shift_summary', { p_shift_id: shiftId })
    if (error) return null
    return parseDebtShiftSummary(data)
  } catch {
    return null
  }
}
