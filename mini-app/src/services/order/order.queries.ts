import { useQuery } from "@tanstack/react-query";
import { orderService, sessionOrderService } from "./order.api";
import {
  GET_ORDER_BY_ID_KEY,
  GET_SESSION_ORDERS_KEY,
  GET_TABLE_SESSION_BILL_KEY,
  GET_TAKEAWAY_ORDERS_KEY,
} from "@/constants/api";

export function useOrderWithItems(orderId: string) {
  return useQuery({
    queryKey: [GET_ORDER_BY_ID_KEY, orderId],
    queryFn: () => orderService.getOrderWithItems(orderId),
    enabled: !!orderId,
  });
}

export function useSessionOrders(zaloUserId: string, tableId: string, enabled = true) {
  return useQuery({
    queryKey: [GET_SESSION_ORDERS_KEY, zaloUserId, tableId],
    queryFn: () => sessionOrderService.getSessionOrders(zaloUserId, tableId),
    enabled: enabled && !!zaloUserId && !!tableId,
    refetchInterval: 30_000,
  });
}

// Bill CẢ PHIÊN (quán trả sau). Khác useSessionOrders: lấy mọi đơn của bàn trong phiên, gồm cả
// đơn nhân viên đặt hộ và đơn của máy trước khi chuyển quyền.
// ⚠️ deviceId PHẢI nằm trong queryKey — khách chỉ có device id (không lấy được Zalo UID) mà
// thiếu nó thì hai người khác nhau dùng chung một ô cache.
export function useTableSessionBill(
  tableId: string,
  zaloUserId: string,
  deviceId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [GET_TABLE_SESSION_BILL_KEY, tableId, zaloUserId, deviceId],
    queryFn: () =>
      sessionOrderService.getTableSessionBill(tableId, zaloUserId || null, deviceId || null),
    enabled: enabled && !!tableId && (!!zaloUserId || !!deviceId),
    refetchInterval: 30_000,
  });
}

export function useTakeawayOrders(zaloUserId: string, storeId: string) {
  return useQuery({
    queryKey: [GET_TAKEAWAY_ORDERS_KEY, zaloUserId, storeId],
    queryFn: () => sessionOrderService.getTakeawayOrders(zaloUserId, storeId),
    enabled: !!zaloUserId && !!storeId,
    refetchInterval: 30_000,
  });
}
