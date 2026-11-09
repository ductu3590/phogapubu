// Sinh tên bàn hàng loạt ("A" + 1→20 = A1..A20) — hàm thuần, dùng chung cho xem trước ở form và server action.

export const BULK_TABLES_MAX = 100

export type BulkTablesInput = { prefix: string; from: number; to: number }

/** Chuẩn hoá để so trùng tên bàn: bỏ khác biệt hoa/thường, khoảng trắng thừa, dạng dấu tiếng Việt. */
export function normalizeTableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('vi')
}

const validNumber = (n: number) => Number.isInteger(n) && n >= 0 && n <= 9999

export function previewBulkTables(
  input: BulkTablesInput,
  existingNames: string[],
): { ok: true; create: string[]; skipped: string[] } | { ok: false; error: string } {
  const { prefix, from, to } = input
  if (!validNumber(from) || !validNumber(to)) {
    return { ok: false, error: 'Số đầu và số cuối phải là số nguyên từ 0 đến 9999' }
  }
  if (to < from) return { ok: false, error: 'Số cuối phải lớn hơn hoặc bằng số đầu' }
  if (to - from + 1 > BULK_TABLES_MAX) return { ok: false, error: `Tối đa ${BULK_TABLES_MAX} bàn một lần` }
  if (prefix.trim().length > 20) return { ok: false, error: 'Tiền tố tối đa 20 ký tự' }

  // Bỏ khoảng trắng đầu, giữ khoảng trắng cuối để "Bàn " + 1 ra "Bàn 1"
  const head = prefix.replace(/^\s+/, '')
  const taken = new Set(existingNames.map(normalizeTableName))
  const create: string[] = []
  const skipped: string[] = []
  for (let n = from; n <= to; n++) {
    const name = `${head}${n}`.trim()
    if (taken.has(normalizeTableName(name))) skipped.push(name)
    else create.push(name)
  }
  return { ok: true, create, skipped }
}
