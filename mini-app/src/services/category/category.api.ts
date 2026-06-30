import { supabase } from "../supabase";
import { Category, CategoryWithProducts } from "@/types/category.types";
import { Product, Topping } from "@/types/product.types";

function mapToppings(rows: Record<string, unknown>[] | null | undefined): Topping[] {
  return (rows ?? [])
    .filter((r) => r.is_available === true)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      price: r.price as number,
    }));
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    price: row.price as number,
    image: (row.image_url as string | null) ?? null,
    isAvailable: row.is_available as boolean,
    categoryId: row.category_id as string,
    sortOrder: row.sort_order as number,
    toppings: mapToppings(row.menu_item_toppings as Record<string, unknown>[] | undefined),
  };
}

export const categoryService = {
  // Lấy menu đầy đủ (categories + items) theo storeId
  getMenuByStore: async (storeId: string): Promise<CategoryWithProducts[]> => {
    const { data, error } = await supabase
      .from("menu_categories")
      .select(
        "*, menu_items(*, menu_item_toppings(id, name, price, is_available, sort_order))",
      )
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;

    return (data ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sort_order,
      products: ((cat.menu_items as Record<string, unknown>[]) ?? [])
        // Giữ cả món hết hàng để hiện mờ + badge "Tạm hết";
        // món còn hàng lên trước, hết hàng dồn xuống cuối, rồi theo sort_order
        .sort((a, b) => {
          const availDiff = (a.is_available ? 0 : 1) - (b.is_available ? 0 : 1);
          if (availDiff !== 0) return availDiff;
          return (a.sort_order as number) - (b.sort_order as number);
        })
        .map(mapProduct),
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
