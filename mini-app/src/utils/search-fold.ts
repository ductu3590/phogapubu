// Tìm món tiếng Việt: khách gõ không dấu ("lau rieu") vẫn ra "Lẩu riêu"; đ/Đ coi như d.
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase();

export function matchesQuery(name: string, query: string): boolean {
  const q = fold(query.trim());
  return q === "" || fold(name).includes(q);
}
