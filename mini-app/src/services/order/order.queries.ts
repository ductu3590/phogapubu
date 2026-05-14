import { useQuery } from "@tanstack/react-query";
import { orderService } from "./order.api";
import { GET_ORDER_BY_ID_KEY } from "@/constants/api";

export function useOrderWithItems(orderId: string) {
  return useQuery({
    queryKey: [GET_ORDER_BY_ID_KEY, orderId],
    queryFn: () => orderService.getOrderWithItems(orderId),
    enabled: !!orderId,
  });
}
