import type { MenuBadgeKey } from "@/utils/menu-badge";

// Topping (add-on) tuỳ chọn của món — chỉ chứa topping còn bán (is_available)
export interface Topping {
  id: string;
  name: string;
  price: number; // phụ thu, VNĐ
}

// Lựa chọn quyết định giá của món (Tháp/Ca/Cốc, đĩa to/nhỏ).
// price là giá TUYỆT ĐỐI, không phải phụ thu.
export interface Variant {
  id: string;
  name: string;
  price: number;                 // giá SAU giảm giá món/danh mục (mig 115)
  originalPrice?: number | null; // giá gốc nếu đang giảm
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;                 // giá SAU giảm giá món/danh mục (mig 115); create_order tự tính lại ở server
  originalPrice?: number | null; // giá gốc nếu đang giảm, null = không giảm
  discountBadge?: string | null; // '−20%' / '−5.000đ'
  discountUntil?: string | null; // 'đến 18:00' / 'đến hết 20/11'
  image: string | null;
  isAvailable: boolean;
  categoryId: string;
  sortOrder: number;
  toppings: Topping[]; // [] nếu món không có topping
  variants: Variant[];             // CHỈ chứa biến thể còn bán; [] nếu món không có
  hasVariantGroup: boolean;        // món CÓ nhóm biến thể hay không, KHÔNG lọc còn-bán
  variantGroupName: string | null; // nhãn hiện cho khách; null → 'Chọn loại'
  badge: MenuBadgeKey | null;      // nhãn món (PA-4): best_seller | signature; null = không nhãn
}
