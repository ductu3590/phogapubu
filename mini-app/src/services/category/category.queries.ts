import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { categoryService } from "./category.api";
import { GET_STORE_MENU_KEY } from "@/constants/api";
import { CategoryWithProducts } from "@/types/category.types";

// Hook chính: lấy toàn bộ menu (categories + items) theo storeId
export function useStoreMenu(storeId: string) {
  return useQuery<CategoryWithProducts[]>({
    queryKey: [GET_STORE_MENU_KEY, storeId],
    queryFn: () => categoryService.getMenuByStore(storeId),
    enabled: !!storeId,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // cache 5 phút
  });
}
