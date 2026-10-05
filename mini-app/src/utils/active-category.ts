// Danh mục đang xem = heading CUỐI CÙNG đã chạm mép trên vùng cuộn danh sách (cộng 8px dung sai
// làm tròn khi cuộn mượt). Chưa heading nào chạm → danh mục đầu. `top` là toạ độ màn hình
// (getBoundingClientRect), `containerTop` là đỉnh vùng cuộn — đo động vì phía trên còn thanh
// công cụ, ô tìm, chip và banner, cao khác nhau theo máy (safe-area) và theo banner đang hiện.
const TOLERANCE = 8;

export function activeCategoryAt(headings: Array<{ id: string; top: number }>, containerTop: number): string {
  if (headings.length === 0) return "";
  let active = headings[0].id;
  for (const h of headings) {
    if (h.top <= containerTop + TOLERANCE) active = h.id;
  }
  return active;
}
