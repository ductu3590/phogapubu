// Chuẩn hoá địa chỉ / SĐT quán trước khi in: quán mới hay để trống hoặc gõ toàn dấu cách,
// in ra sẽ thành một dòng trắng giữa đầu phiếu. Rỗng → null để component bỏ hẳn dòng đó.
export function cleanStoreText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}
