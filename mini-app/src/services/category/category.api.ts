import { supabase } from "../supabase";
import { Category, CategoryWithProducts } from "@/types/category.types";
import { Product } from "@/types/product.types";

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
  };
}

export const categoryService = {
  // Lấy menu đầy đủ (categories + items) theo storeId
  getMenuByStore: async (storeId: string): Promise<CategoryWithProducts[]> => {
    const { data, error } = await supabase
      .from("menu_categories")
      .select("*, menu_items(*)")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;

    return (data ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sort_order,
      products: ((cat.menu_items as Record<string, unknown>[]) ?? [])
        .filter((item) => item.is_available)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
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
