import { supabase } from "../supabase";
import { Category, CategoryWithProducts } from "@/types/category.types";
import { Product, Topping, Variant } from "@/types/product.types";
import { menuBadge } from "@/utils/menu-badge";
import { applyMenuDiscount, discountBadge, parseActiveDiscounts, untilLabel, type ActiveRule } from "@/utils/menu-discount";

function mapToppings(links: Record<string, unknown>[] | null | undefined): Topping[] {
  return (links ?? [])
    .map((l) => l.toppings as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => !!t && t.is_available === true)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((t) => ({ id: t.id as string, name: t.name as string, price: t.price as number }));
}

function mapVariants(rows: Record<string, unknown>[] | null | undefined): Variant[] {
  return (rows ?? [])
    .filter((v) => v.is_available === true)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((v) => ({ id: v.id as string, name: v.name as string, price: v.price as number }));
}

// Có HAI kiểu "tạm hết": (1) chủ quán tắt cả món (is_available = false);
// (2) món có nhóm biến thể nhưng MỌI biến thể đều bị tắt — món vẫn is_available = true
// nhưng khách không chọn được gì để mua (menu card đã hiện badge "Tạm hết").
// Cả hai kiểu đều phải dồn xuống cuối danh mục, không để món không mua được nằm trên đầu.
function isRowSoldOut(row: Record<string, unknown>): boolean {
  if (row.is_available !== true) return true;
  const variants = (row.menu_item_variants as Record<string, unknown>[] | undefined) ?? [];
  return variants.length > 0 && !variants.some((v) => v.is_available === true);
}

function mapProduct(row: Record<string, unknown>, rules?: ActiveRule[]): Product {
  // Giảm giá món / danh mục đang chạy (mig 115): áp cho giá món và từng giá lựa chọn.
  const base = applyMenuDiscount(row.price as number, rules);
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    price: base.price,
    originalPrice: base.originalPrice,
    discountBadge: base.rule ? discountBadge(base.rule) : null,
    discountUntil: base.rule ? untilLabel(base.rule) : null,
    image: (row.image_url as string | null) ?? null,
    isAvailable: row.is_available as boolean,
    categoryId: row.category_id as string,
    sortOrder: row.sort_order as number,
    toppings: mapToppings(row.menu_item_toppings as Record<string, unknown>[] | undefined),
    variants: mapVariants(row.menu_item_variants as Record<string, unknown>[] | undefined).map((v) => {
      const d = applyMenuDiscount(v.price, rules);
      return { ...v, price: d.price, originalPrice: d.originalPrice };
    }),
    hasVariantGroup: ((row.menu_item_variants as unknown[] | undefined) ?? []).length > 0,
    variantGroupName: (row.variant_group_name as string | null) ?? null,
    badge: menuBadge(row.badge)?.key ?? null,
  };
}

export const categoryService = {
  // Lấy menu đầy đủ (categories + items) theo storeId
  getMenuByStore: async (storeId: string): Promise<CategoryWithProducts[]> => {
    const [{ data, error }, discountRes] = await Promise.all([
      supabase
        .from("menu_categories")
        .select(
          "*, menu_items(*, menu_item_toppings(toppings(id, name, price, is_available, sort_order)), menu_item_variants(id, name, price, is_available, sort_order))",
        )
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("sort_order"),
      // Lỗi ở đây KHÔNG được chặn menu: mất giá gạch thì vẫn đặt được, server vẫn trừ đúng.
      Promise.resolve(supabase.rpc("get_active_menu_discounts", { p_store_id: storeId })).catch(() => ({ data: null, error: true })),
    ]);

    if (error) throw error;
    const discounts = parseActiveDiscounts(discountRes.error ? null : discountRes.data);

    return (data ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sort_order,
      products: ((cat.menu_items as Record<string, unknown>[]) ?? [])
        // Giữ cả món hết hàng để hiện mờ + badge "Tạm hết";
        // món còn hàng lên trước, hết hàng dồn xuống cuối, rồi theo sort_order
        .sort((a, b) => {
          const availDiff = (isRowSoldOut(a) ? 1 : 0) - (isRowSoldOut(b) ? 1 : 0);
          if (availDiff !== 0) return availDiff;
          return (a.sort_order as number) - (b.sort_order as number);
        })
        .map((row) => mapProduct(row, discounts.get(row.id as string))),
    }));
  },

  // Lấy danh sách categories (không kèm items)
  getCategories: async (storeId: string): Promise<Category[]> => {
    const { data, error } = await supabase
      .from("menu_categories")
      .select("id, name, sort_order")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;

    return (data ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sort_order,
    }));
  },
};
