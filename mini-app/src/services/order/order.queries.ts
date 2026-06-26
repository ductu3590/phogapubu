import { useQuery } from "@tanstack/react-query";
import { orderService, sessionOrderService } from "./order.api";
import { GET_ORDER_BY_ID_KEY } from "@/constants/api";

export function useOrderWithItems(orderId: string) {
  return useQuery({
    queryKey: [GET_ORDER_BY_ID_KEY, orderId],
    queryFn: () => orderService.getOrderWithItems(orderId),
    enabled: !!orderId,
  });
}

export function useSessionOrders(zaloUserId: string, tableId: string) {
  return useQuery({
    queryKey: ["session-orders", zaloUserId, tableId],
    queryFn: () => sessionOrderService.getSessionOrders(zaloUserId, tableId),
    enabled: !!zaloUserId && !!tableId,
    refetchInterval: 30_000,
  });
}
