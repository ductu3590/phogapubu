// Danh mục có ảnh đẹp → lưới 2 cột kiểu Stitch m06; danh mục không ảnh → danh sách gọn,
// tránh hàng loạt ô ảnh trống (Bảo Lương 0/65 món có ảnh). 1 món thì lưới chỉ còn nửa hàng → danh sách.
const GRID_MIN_RATIO = 0.6;

export function pickProductLayout(products: Array<{ image?: string | null }>): "grid" | "list" {
  if (products.length < 2) return "list";
  const withImage = products.filter((p) => typeof p.image === "string" && p.image.trim() !== "").length;
  return withImage / products.length >= GRID_MIN_RATIO ? "grid" : "list";
}
