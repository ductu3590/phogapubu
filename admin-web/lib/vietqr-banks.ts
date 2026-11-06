// Danh sách ngân hàng hỗ trợ VietQR (chuyển khoản nhanh), lấy từ api.vietqr.io/v2/banks
// ngày 2026-11-05, chỉ giữ ngân hàng transferSupported=1, bỏ ví. Ngân hàng lớn lên đầu.
export const VIETQR_BANKS: { bin: string; name: string }[] = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970422', name: 'MBBank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970431', name: 'Eximbank' },
  { bin: '970426', name: 'MSB' },
  { bin: '970448', name: 'OCB' },
  { bin: '970440', name: 'SeABank' },
  { bin: '970449', name: 'LPBank' },
  { bin: '970428', name: 'NamABank' },
  { bin: '970412', name: 'PVcomBank' },
  { bin: '970409', name: 'BacABank' },
  { bin: '970427', name: 'VietABank' },
  { bin: '970425', name: 'ABBANK' },
  { bin: '970438', name: 'BaoVietBank' },
  { bin: '970452', name: 'KienLongBank' },
  { bin: '970400', name: 'SaigonBank' },
  { bin: '970430', name: 'PGBank' },
  { bin: '970419', name: 'NCB' },
  { bin: '970454', name: 'VietCapitalBank' },
  { bin: '970433', name: 'VietBank' },
  { bin: '970414', name: 'MBV' },
  { bin: '970446', name: 'COOPBANK' },
  { bin: '546034', name: 'CAKE' },
  { bin: '546035', name: 'Ubank' },
  { bin: '963388', name: 'Timo' },
  { bin: '970424', name: 'ShinhanBank' },
  { bin: '970457', name: 'Woori' },
  { bin: '422589', name: 'CIMB' },
  { bin: '668888', name: 'KBank' },
  { bin: '970434', name: 'IndovinaBank' },
]

/** Tên ngân hàng theo BIN; không có trong danh sách thì trả lại chính BIN. */
export function bankName(bin: string): string {
  return VIETQR_BANKS.find((b) => b.bin === bin)?.name ?? bin
}
