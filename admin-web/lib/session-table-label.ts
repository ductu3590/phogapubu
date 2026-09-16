type SessionTableLabelRow = { table_number: string }

// Một mâm là một bill nhưng khách có thể gọi từ bất kỳ QR nào trong mâm. Mọi màn vận hành phải
// nói cùng một nhãn bàn để bếp và POS không tưởng là hai đơn/bàn khác nhau.
export function sessionTableLabel(rows: SessionTableLabelRow[], fallback: string): string {
  const names = [...new Set(rows.map((row) => row.table_number).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }))
  return names.join(', ') || fallback
}
